import { Injectable, Inject, Optional } from '@nestjs/common';
import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Job } from 'bullmq';
import { LOGGER_SERVICE, PinoLoggerService } from '@goalxi/logger';
import {
  applyWeeklyGrowth,
  calculateAssignedCoachBonus,
  CoachPlayerAssignmentEntity,
  getCategorySkillKeys,
  isYouthCoachCategory,
  pickNextRevealSkills,
  PlayerEntity,
  StaffEntity,
  StaffRole,
  applyYouthCoachCategoryTraining,
} from '@goalxi/database';

export interface YouthProgressionResult {
  youthProcessed: number;
  youthGrew: number;
  youthCoachBoosted: number;
  youthRevealed: number;
}

/**
 * Weekly youth-progression worker.
 *
 * Mirrors the senior team model: every youth player receives base
 * weekly growth (`applyWeeklyGrowth`); those assigned to the team's
 * `YOUTH_COACH` additionally get a category-wide bonus computed by
 * `applyYouthCoachCategoryTraining`. The youth coach's category lives
 * on `StaffEntity.trainedSkill` (switchable at any time), and up to 3
 * youth players can be assigned to one coach via the existing
 * `CoachPlayerAssignmentEntity` table.
 *
 * Reveal mechanics (`pickNextRevealSkills`) run for every youth
 * regardless of coach assignment so the fog-of-war clears on its own
 * cadence.
 *
 * Runs in parallel with the senior training settlement; same cadence
 * (Thursday 00:00 UTC, kicked off by `WeeklySettlementService`).
 */
@Injectable()
@Processor('youth-progression-settlement')
export class YouthProgressionProcessor extends WorkerHost {
  /** Inject deterministic RNG for tests; defaults to Math.random. */
  constructor(
    @Inject(LOGGER_SERVICE)
    private readonly logger: PinoLoggerService,
    @InjectRepository(PlayerEntity)
    private readonly playerRepo: Repository<PlayerEntity>,
    @InjectRepository(StaffEntity)
    private readonly staffRepo: Repository<StaffEntity>,
    @InjectRepository(CoachPlayerAssignmentEntity)
    private readonly assignmentRepo: Repository<CoachPlayerAssignmentEntity>,
    @Optional()
    private readonly random: () => number = Math.random,
  ) {
    super();
  }

  async process(
    job: Job<unknown, unknown, string>,
  ): Promise<YouthProgressionResult> {
    this.logger.info(
      '[YouthProgressionProcessor] Starting youth progression settlement...',
    );
    const start = Date.now();

    // 1. Load every youth coach + their assignments in two queries
    //    (rather than per-player) so a 200-team league with 200 youth
    //    coaches stays O(1) in DB roundtrips.
    const youthCoaches = await this.staffRepo.find({
      where: { role: StaffRole.YOUTH_COACH, isActive: true },
    });
    const coachByTeam = new Map<string, StaffEntity>();
    for (const c of youthCoaches) {
      coachByTeam.set(c.teamId, c);
    }
    const coachIds = youthCoaches.map((c) => c.id);
    const assignments = coachIds.length
      ? await this.assignmentRepo.find({
          where: { coachId: In(coachIds) },
        })
      : [];
    const assignmentByPlayer = new Map<string, CoachPlayerAssignmentEntity>();
    for (const a of assignments) {
      assignmentByPlayer.set(a.playerId, a);
    }

    // 2. Iterate every youth player.
    const youth = await this.playerRepo.find({ where: { isYouth: true } });
    this.logger.info(
      `[YouthProgressionProcessor] Processing ${youth.length} youth player(s) (${youthCoaches.length} youth coach(es))`,
    );

    let youthGrew = 0;
    let youthCoachBoosted = 0;
    let youthRevealed = 0;

    for (const player of youth) {
      if (!player.currentSkills || !player.potentialSkills) {
        continue;
      }
      if (!player.teamId) {
        // Free-agent youth (no team) — nothing to do. The UI's "promote"
        // flow can still flip is_youth on these, but no coach will ever
        // own them.
        continue;
      }

      // 2a) Base weekly growth (the existing applyWeeklyGrowth contract).
      const skillSumBefore = sumSkills(player.currentSkills);
      applyWeeklyGrowth(player, this.random);
      const skillSumAfter = sumSkills(player.currentSkills);
      const skillGrew = skillSumAfter > skillSumBefore + 1e-6;

      // 2b) Youth-coach category bonus, if assigned.
      const assignment = assignmentByPlayer.get(player.id);
      const coach = assignment
        ? youthCoaches.find((c) => c.id === assignment.coachId)
        : coachByTeam.get(player.teamId);

      let coachBoosted = false;
      if (
        coach &&
        isYouthCoachCategory(assignment?.trainingCategory ?? coach.trainedSkill)
      ) {
        const category =
          assignment?.trainingCategory ?? (coach.trainedSkill as string);
        const keys = getCategorySkillKeys(category, player.isGoalkeeper);
        if (keys.length > 0) {
          const bonus = calculateAssignedCoachBonus([coach], coach.level);
          applyYouthCoachCategoryTraining(
            player.id,
            player.fractionalAge,
            player.currentSkills,
            player.potentialSkills,
            player.isGoalkeeper,
            0, // youth training has no stamina-intensity discount yet
            bonus,
            1, // 1 week
            category,
            keys,
          );
          coachBoosted = true;
        }
      }

      // 2c) Reveal next batch of skills. pickNextRevealSkills returns
      //     a NEW array per its contract.
      const oldRevealed = player.revealedSkills ?? [];
      const newRevealed = pickNextRevealSkills(
        { isGoalkeeper: player.isGoalkeeper, revealedSkills: oldRevealed },
        this.random,
      );
      const revealedAdded = newRevealed.length > oldRevealed.length;

      if (!skillGrew && !coachBoosted && !revealedAdded) {
        continue;
      }

      player.revealedSkills = newRevealed;
      // revealLevel is a coarse UI counter; precise gate logic should
      // consult revealedSkills.length against PROMOTION_REVEAL_THRESHOLD.
      player.revealLevel = newRevealed.length;

      await this.playerRepo.save(player);
      if (skillGrew) youthGrew++;
      if (coachBoosted) youthCoachBoosted++;
      if (revealedAdded) youthRevealed++;

      this.logger.debug(
        `[YouthProgressionProcessor] Player ${player.name} (${player.id}): ` +
          `skills Δ${(skillSumAfter - skillSumBefore).toFixed(2)}, ` +
          `coachBoosted=${coachBoosted}, ` +
          `revealed ${oldRevealed.length}→${newRevealed.length}`,
      );
    }

    const duration = Date.now() - start;
    this.logger.info(
      `[YouthProgressionProcessor] Done in ${duration}ms — ` +
        `${youth.length} youth, grew=${youthGrew}, ` +
        `coachBoosted=${youthCoachBoosted}, revealed=${youthRevealed}`,
    );

    return {
      youthProcessed: youth.length,
      youthGrew,
      youthCoachBoosted,
      youthRevealed,
    };
  }

  @OnWorkerEvent('completed')
  onCompleted(job: Job) {
    this.logger.debug(
      `Youth progression settlement job ${job.id} completed`,
    );
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job, err: Error) {
    this.logger.error(
      `Youth progression settlement job ${job.id} failed: ${err.message}`,
    );
  }
}

/** Sum all numeric leaf values of a nested skills object. */
function sumSkills(skills: Record<string, any> | null | undefined): number {
  if (!skills) return 0;
  let total = 0;
  for (const category of Object.values(skills)) {
    if (category && typeof category === 'object') {
      for (const v of Object.values(category as Record<string, number>)) {
        if (typeof v === 'number') total += v;
      }
    }
  }
  return total;
}
