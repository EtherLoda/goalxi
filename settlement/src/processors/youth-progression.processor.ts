import { Injectable, Inject, Optional } from '@nestjs/common';
import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Job } from 'bullmq';
import { LOGGER_SERVICE, PinoLoggerService } from '@goalxi/logger';
import {
  applyWeeklyGrowth,
  pickNextRevealSkills,
  PlayerEntity,
} from '@goalxi/database';

export interface YouthProgressionResult {
  youthProcessed: number;
  youthGrew: number;
  youthRevealed: number;
}

/**
 * Weekly youth-progression worker.
 *
 * Runs alongside the senior training tick (Thursday 00:00 UTC, kicked
 * off by `WeeklySettlementService`). The historical YOUTH_COACH staff
 * role was removed when the youth subsystem was paused, so this worker
 * is now responsible for the two youth-only mechanics that still need
 * to keep running:
 *
 *   1. Base weekly growth (`applyWeeklyGrowth`).
 *   2. Fog-of-war reveal (`pickNextRevealSkills`).
 *
 * Both run for every youth regardless of team — there is no coach
 * bonus to apply any more.
 *
 * Writes are batched into a single per-tick transaction: the loop
 * mutates player rows in memory, then a single `dataSource.transaction`
 * commits them all. A failure on the Nth save no longer leaves the
 * first N-1 committed (the previous per-player `save` loop was
 * implicitly per-row autocommit).
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
    @InjectDataSource()
    private readonly dataSource: DataSource,
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

    // Iterate every youth player. No coach query is needed any more.
    const youth = await this.playerRepo.find({ where: { isYouth: true } });
    this.logger.info(
      `[YouthProgressionProcessor] Processing ${youth.length} youth player(s) (no youth coach in the system)`,
    );

    let youthGrew = 0;
    let youthRevealed = 0;
    const dirtyPlayers: PlayerEntity[] = [];

    for (const player of youth) {
      if (!player.currentSkills || !player.potentialSkills) {
        continue;
      }
      if (!player.teamId) {
        // Free-agent youth (no team) — nothing to do. The UI's "promote"
        // flow can still flip is_youth on these, but they don't grow
        // until they're rostered somewhere.
        continue;
      }

      // 1) Base weekly growth.
      const skillSumBefore = sumSkills(player.currentSkills);
      applyWeeklyGrowth(player, this.random);
      const skillSumAfter = sumSkills(player.currentSkills);
      const skillGrew = skillSumAfter > skillSumBefore + 1e-6;

      // 2) Reveal next batch of skills. pickNextRevealSkills returns
      //    a NEW array per its contract.
      const oldRevealed = player.revealedSkills ?? [];
      const newRevealed = pickNextRevealSkills(
        { isGoalkeeper: player.isGoalkeeper, revealedSkills: oldRevealed },
        this.random,
      );
      const revealedAdded = newRevealed.length > oldRevealed.length;

      if (!skillGrew && !revealedAdded) {
        continue;
      }

      player.revealedSkills = newRevealed;
      // revealLevel is a coarse UI counter; precise gate logic should
      // consult revealedSkills.length against PROMOTION_REVEAL_THRESHOLD.
      player.revealLevel = newRevealed.length;

      dirtyPlayers.push(player);
      if (skillGrew) youthGrew++;
      if (revealedAdded) youthRevealed++;

      this.logger.debug(
        `[YouthProgressionProcessor] Player ${player.name} (${player.id}): ` +
          `skills Δ${(skillSumAfter - skillSumBefore).toFixed(2)}, ` +
          `revealed ${oldRevealed.length}→${newRevealed.length}`,
      );
    }

    // Single batched commit — see class docstring.
    if (dirtyPlayers.length > 0) {
      await this.dataSource.transaction(async (manager) => {
        await manager.getRepository(PlayerEntity).save(dirtyPlayers);
      });
    }

    const duration = Date.now() - start;
    this.logger.info(
      `[YouthProgressionProcessor] Done in ${duration}ms — ` +
        `${youth.length} youth, grew=${youthGrew}, ` +
        `revealed=${youthRevealed}`,
    );

    return {
      youthProcessed: youth.length,
      youthGrew,
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
