import { QueueName } from '@/constants/job.constant';
import { ValidationException } from '@/exceptions/validation.exception';
import {
  ONBOARDING_PENDING_NAME,
  TeamEntity,
  UserEntity,
  UserOnboardingStatus,
  Uuid,
} from '@goalxi/database';
import { LOGGER_SERVICE, PinoLoggerService } from '@goalxi/logger';
import { InjectQueue } from '@nestjs/bullmq';
import { Inject, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Queue } from 'bullmq';
import { Repository } from 'typeorm';

import { ErrorCode } from '@/constants/error-code.constant';
import { OnboardingStateResDto } from './dto/onboarding-state.res.dto';

/**
 * Payload the API hands to the settlement worker for each
 * `assign-team` job. Keep the shape tiny — every byte is a
 * Redis hop — and version the discriminator so a future
 * schema bump (e.g. carrying the user's locale for the
 * welcome message) can roll out without a queue flush.
 */
export interface AssignTeamJobPayload {
  v: 1;
  userId: string;
}

/**
 * Read + trigger surface for the onboarding state machine.
 *
 * The actual "pick a BOT and claim it" work runs in
 * `settlement/src/processors/onboarding.processor.ts` via a
 * BullMQ job. This service:
 *
 *   - exposes `/onboarding/state` so the frontend can poll
 *     for the worker's progress without holding a websocket
 *     open; and
 *   - emits a new `assign-team` job for the manual retry
 *     path (`POST /onboarding/claim`).
 *
 * Why the API does not run the claim itself: the register
 * path is the hot path; we want to return the JWT in under
 * 100ms even when 50 simultaneous registrations land. Fanning
 * out the heavy work to settlement keeps the API responsive
 * and lets the existing BullMQ retry/observability tooling
 * cover the new pipeline for free.
 */
@Injectable()
export class OnboardingService {
  constructor(
    @Inject(LOGGER_SERVICE)
    private readonly logger: PinoLoggerService,
    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,
    @InjectRepository(TeamEntity)
    private readonly teamRepo: Repository<TeamEntity>,
    @InjectQueue(QueueName.ONBOARDING)
    private readonly onboardingQueue: Queue<AssignTeamJobPayload>,
  ) {}

  /**
   * Read the user's onboarding state. Used by the frontend's
   * `AuthContext` on every navigation to decide between
   * `/dashboard` and `/onboarding/select`.
   */
  async getOnboardingState(userId: string): Promise<OnboardingStateResDto> {
    const user = await this.userRepo.findOne({
      where: { id: userId as Uuid },
      select: ['id', 'onboardingStatus'],
    });
    if (!user) {
      throw new ValidationException(ErrorCode.E002, 'User not found');
    }

    if (user.onboardingStatus === UserOnboardingStatus.ACTIVE) {
      const team = await this.teamRepo.findOne({
        where: { userId: userId as Uuid, isBot: false },
      });
      if (team) {
        return {
          status: UserOnboardingStatus.ACTIVE,
          hasTeam: true,
          // `needsName` is the rename-step gate. It is true
          // exactly when the assigner just stamped the team
          // with the `ONBOARDING_PENDING_NAME` sentinel and
          // the manager hasn't filled in a real name yet. The
          // select page uses this to render the "name your
          // club" form on the first visit only — see
          // `OnboardingStateResDto` for the contract.
          needsName: team.name === ONBOARDING_PENDING_NAME,
          team: {
            id: team.id,
            name: team.name,
            shortCode: team.shortCode,
            leagueId: team.leagueId,
            isBot: team.isBot,
            eloRating: team.eloRating,
            botLevel: team.botLevel,
          },
        };
      }
      // ACTIVE in the user row but no team row exists — the
      // team was hard-deleted out from under the user. Demote
      // to TEAMLESS so the next /claim attempt can re-assign.
      this.logger.warn(
        `[Onboarding] userId=${userId} status=active but no team row — falling back to teamless`,
      );
    }

    return {
      status: user.onboardingStatus,
      hasTeam: false,
      // No team → no rename gate to surface. Frontend should
      // never reach the form path in this branch — the select
      // page only reads `needsName` after confirming `hasTeam`.
      needsName: false,
      team: null,
    };
  }

  /**
   * Manually enqueue an `assign-team` job for the given user.
   *
   * Used by `POST /onboarding/claim` (manual retry) and as a
   * safety valve from `AuthService.register` if the original
   * `register`-time enqueue somehow failed (e.g. Redis blip).
   *
   * The function is safe to call repeatedly — BullMQ's jobId
   * dedup ensures only one job runs per enqueue window, and
   * the worker itself is idempotent (see
   * `OnboardingAssigner.claim`'s existing-team short-circuit).
   *
   * Why `assign-team-{userId}` and not `assign-team:{userId}`?
   * BullMQ 5.x's `Job.validateOptions` rejects custom job
   * ids that contain `:` (see `bullmq/classes/job.js`'s
   * `validateOptions`). The previous code used `:` as a
   * separator and was silently throwing inside
   * `Queue.add()`'s `Job.create`, which `AuthService.register`
   * caught and swallowed — leaving the user stuck in
   * TEAMLESS with no enqueue record. The dash form below
   * passes `validateOptions` cleanly. See
   * `api/scripts/_add-test.cjs` for the reproducer.
   */
  async enqueueAssignTeam(userId: string): Promise<void> {
    // We deliberately do NOT pass a custom `jobId` to
    // `Queue.add`. The previous version used
    // `assign-team-{userId}` as a dedup key, but that collided
    // with BullMQ's jobId semantics: a failed job's hash is
    // still in Redis (BullMQ preserves it for inspection), so
    // a manual retry would either (a) merge into the failed
    // record and never create a new run, or (b) error out on
    // the second `add`. Letting BullMQ pick a fresh id per
    // `add()` is the simplest correct behaviour: every retry
    // is a brand-new run, and the worker's
    // `OnboardingAssigner.claim` is already idempotent (it
    // short-circuits if the user already owns a team).
    await this.onboardingQueue.add(
      'assign-team',
      { v: 1, userId },
      {
        attempts: 3,
        backoff: { type: 'exponential', delay: 1500 },
        // Reasonable cap so a broken worker can't pin a job
        // for 24h. With attempts: 3 and 1.5s base, total
        // ~10s of retry, which is way below this cap.
        removeOnComplete: { age: 3600, count: 1000 },
        removeOnFail: { age: 86400 },
      },
    );
    this.logger.log(
      `[Onboarding] enqueueAssignTeam userId=${userId} (fresh job id per add)`,
    );
  }
}
