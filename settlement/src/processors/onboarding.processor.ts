import { Injectable, Inject } from '@nestjs/common';
import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { Job, UnrecoverableError } from 'bullmq';
import { LOGGER_SERVICE, PinoLoggerService } from '@goalxi/logger';
import {
  OnboardingAssigner,
  OnboardingClaimRaceError,
  OnboardingNoBotAvailableError,
  TeamEntity,
  Uuid,
} from '@goalxi/database';

/**
 * Payload contract shared with the API service's
 * `OnboardingService.enqueueAssignTeam`. We re-declare it
 * here rather than importing across the workspace boundary
 * because `api/` and `settlement/` are sibling Nest apps —
 * the queue name (`onboarding-assignment`) is the only
 * legitimate cross-service contract, and matching the
 * payload shape by hand is the right level of "loose
 * coupling". If you change one, change both.
 */
export interface AssignTeamJobPayload {
  v: 1 | 2;
  userId: string;
  teamName?: string | null;
}

export interface OnboardingAssignmentResult {
  userId: string;
  teamId: string | null;
  reused: boolean;
  /** Kept in the result shape as a derived `reused`-flipped
   *  flag so existing log consumers / dashboards keep
   *  parsing the line. */
  scoutSeeded: boolean;
  durationMs: number;
}

/**
 * Consumer for the `onboarding-assignment` queue produced by
 * `AuthService.register` and `OnboardingService.enqueueAssignTeam`.
 *
 * The processor is intentionally tiny — the heavy lifting
 * (the league-pick algorithm + the claim transaction) lives in
 * `OnboardingAssigner.claim` inside `@goalxi/database`, so this
 * worker is just an I/O shell that:
 *
 *   1. flips the user to PROCESSING so the frontend can render
 *      the loading screen;
 *   2. calls `OnboardingAssigner.claim`;
 *   3. on success, seeds the team's first senior scout
 *      candidate so the new manager has something to look at
 *      in the inbox;
 *   4. classifies errors so BullMQ retries only the ones that
 *      are worth retrying.
 *
 * Error classification:
 *   - `OnboardingNoBotAvailableError` — bootstrap incomplete,
 *     no point retrying. Surfaced as an `UnrecoverableError`
 *     so BullMQ moves the job straight to the failed set.
 *   - `OnboardingClaimRaceError` — another concurrent worker
 *     grabbed the same BOT between the pick and the claim.
 *     BullMQ retries with the queue's `attempts: 3` and
 *     `backoff: exponential, delay: 1500` policy.
 *   - Anything else — also retried. We assume transient DB
 *     blips are more common than logic bugs, so prefer retry
 *     over `UnrecoverableError`. Operators see the failure in
 *     the BullMQ dashboard.
 */
@Injectable()
@Processor('onboarding-assignment', { concurrency: 4 })
export class OnboardingProcessor extends WorkerHost {
  constructor(
    @Inject(LOGGER_SERVICE)
    private readonly logger: PinoLoggerService,
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {
    super();
  }

  async process(
    job: Job<AssignTeamJobPayload, OnboardingAssignmentResult, string>,
  ): Promise<OnboardingAssignmentResult> {
    const start = Date.now();
    const payload = job.data;
    // Accept both v1 (legacy) and v2 (current) payloads. v1
    // jobs don't carry `teamName`; the assigner falls back
    // to `DEFAULT_TEAM_NAME` so we don't have to drain the
    // queue after the bump.
    if (!payload || (payload.v !== 1 && payload.v !== 2) || !payload.userId) {
      // Malformed payload — refuse to retry, this won't fix
      // itself and the producer is the only place that can
      // emit this shape.
      throw new UnrecoverableError(
        `[Onboarding] Malformed job payload (v=${payload?.v}, userId=${payload?.userId})`,
      );
    }

    const { userId, teamName } = payload;
    this.logger.log(
      `[Onboarding] processing assign-team userId=${userId} teamName=${teamName ?? '<default>'} jobId=${job.id} attempt=${job.attemptsMade + 1}`,
    );

    let team: TeamEntity;
    let reused: boolean;
    let appliedName: string;
    try {
      // Step 1 — flip the user to PROCESSING so the polling
      // endpoint reflects "work in flight". Idempotent; the
      // assigner won't move them out of ACTIVE even if it
      // already happened.
      await OnboardingAssigner.markProcessing(this.dataSource, userId as Uuid);

      // Step 2 — pick + claim + scrub + squad/staff/scout regen.
      // The assigner runs the whole sequence in a single
      // transaction; the worker just awaits the result. See
      // `OnboardingAssigner.claim` for the per-step rationale.
      //
      // We pass `teamName` only when the caller supplied one —
      // the assigner falls back to `DEFAULT_TEAM_NAME` for
      // undefined, and the worker's own contract is "if the
      // producer wants a name, it's in the payload; otherwise
      // we don't pretend". This keeps the call shape
      // observable for tests (2-arg call when no teamName).
      const claim = teamName
        ? await OnboardingAssigner.claim(
            this.dataSource,
            userId as Uuid,
            teamName,
          )
        : await OnboardingAssigner.claim(this.dataSource, userId as Uuid);
      team = claim.team;
      reused = claim.reused;
      appliedName = claim.appliedName;
    } catch (err) {
      // Error classification:
      //  - `OnboardingNoBotAvailableError` — bootstrap
      //    incomplete, no point retrying. Surface verbatim so
      //    BullMQ classifies it as a regular failure (the
      //    queue's attempts/backoff is intentional for this
      //    case: it gives bootstrap time to land on a
      //    follow-up tick).
      //  - `OnboardingClaimRaceError` — another worker
      //    grabbed the BOT between pick and claim. Re-throw
      //    so BullMQ retries with the queue's exponential
      //    backoff (see queue config).
      //  - Anything else (malformed mocks, transient DB blips
      //    that escaped the assigner's retries, type errors
      //    from a half-built test stub, etc.) — wrap as
      //    UnrecoverableError. The assigner is the
      //    load-bearing piece; if it raised something
      //    unrecognised we don't want BullMQ hammering it
      //    forever.
      if (
        err instanceof UnrecoverableError ||
        err instanceof OnboardingNoBotAvailableError ||
        err instanceof OnboardingClaimRaceError
      ) {
        throw err;
      }
      const e = err as Error;
      this.logger.error(
        `[Onboarding] unexpected error userId=${userId}: ${e.message}`,
        e.stack,
      );
      throw new UnrecoverableError(
        `[Onboarding] unexpected error: ${e.message}`,
      );
    }

    const result: OnboardingAssignmentResult = {
      userId,
      teamId: team.id,
      reused,
      // Scout seed now lives inside the assigner's transaction
      // (it rides the same atomic unit as the claim + scrub +
      // squad regen), so we no longer have a separate
      // `scoutSeeded` boolean. Kept in the result shape as
      // a derived `reused`-flipped flag so existing log
      // consumers / dashboards keep parsing the line.
      scoutSeeded: !reused,
      durationMs: Date.now() - start,
    };
    this.logger.log(
      `[Onboarding] success userId=${userId} teamId=${team.id} reused=${reused} scoutSeeded=${result.scoutSeeded} appliedName="${appliedName}" durationMs=${result.durationMs}`,
    );
    return result;
  }

  @OnWorkerEvent('completed')
  onCompleted(job: Job, result: OnboardingAssignmentResult) {
    this.logger.debug(
      `[Onboarding] job ${job.id} completed userId=${result.userId} teamId=${result.teamId}`,
    );
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job, err: Error) {
    // Surface UnrecoverableError loudly — those mean the
    // system is in a state we can't fix by retrying (e.g.
    // bootstrap missing, malformed payload). Operators need
    // to see them in the log sink.
    const unrecoverable = err instanceof UnrecoverableError;
    const level = unrecoverable ? 'error' : 'warn';
    this.logger[level](
      `[Onboarding] job ${job.id} failed (${unrecoverable ? 'unrecoverable' : 'retryable'}): ${err.message}`,
    );
  }
}
