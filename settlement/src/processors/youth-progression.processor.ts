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
  TeamEntity,
} from '@goalxi/database';

export interface YouthProgressionResult {
  youthProcessed: number;
  youthGrew: number;
  youthRevealed: number;
}

/**
 * Weekly youth-progression worker.
 *
 * ## ⛔ FROZEN SUBSYSTEM — hands off
 *
 * Youth development is paused indefinitely (see the "Youth Pipeline"
 * section of `CLAUDE.md` for the full freeze notice). **Do not develop,
 * extend, or "improve" this worker** without an explicit go-ahead from
 * the maintainer.
 *
 * What that means concretely, because these all look like reasonable
 * bugs to fix in passing:
 *
 *  - **No new features.** No youth scouts, academy upgrades, loan
 *    pathways, or a Youth Mode toggle.
 *  - **Do not "fix" the deliberate rough edges.** The team filters, the
 *    absent age curve, and the unbounded-growth-toward-potential model
 *    are all documented under *Known limitations* in `CLAUDE.md`. Each
 *    one looks like a bug; repairing it re-opens a path nobody has
 *    validated.
 *  - **Runtime behaviour must not change.** This worker still ticks
 *    every Thursday and still writes rows. Freezing means hands off, NOT
 *    shut it down.
 *  - **Bug fixes are still welcome** where this is actively running (it
 *    grows every youth player's skills each week). Keep those minimal
 *    and self-contained.
 *
 * If something here genuinely must change, say so and wait for an answer
 * rather than fixing it in passing. A drive-by "cleanup" in this area has
 * already caused one regression (the un-swappable playoff ladder).
 *
 * ---
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

    // Load every youth player WITH its team in one join, then filter out
    // BOT squads in JS. This is the only player-subsystem processor that
    // used to touch BOT squads:
    //
    //   - TrainingProcessor skips bot teams
    //   - ConditionProcessor freezes bot squads (form/minutes reset only)
    //   - PlayerDeclineProcessor excludes bot players
    //     ("Bot rosters must stay frozen" — its own class docstring)
    //   - InjuryRecoveryService skips bot teams
    //
    // `youth-structure.generator.ts` creates one `youth_team` per EVERY
    // senior team, bots included, so without this filter BOT academy
    // players grew without bound every week — which matters because
    // growth walks current skills TOWARD potential and never retunes
    // potential itself, so a BOT academy eventually produces free agents
    // indistinguishable from real prospects.
    const youth = await this.playerRepo.find({
      where: { isYouth: true },
      relations: ['team'],
    });
    this.logger.info(
      `[YouthProgressionProcessor] Processing ${youth.length} youth player(s) (no youth coach in the system)`,
    );

    let youthGrew = 0;
    let youthRevealed = 0;
    let skippedNoTeam = 0;
    let skippedBot = 0;
    let skippedNoSkills = 0;
    const dirtyPlayers: PlayerEntity[] = [];

    for (const player of youth) {
      if (!player.currentSkills || !player.potentialSkills) {
        skippedNoSkills++;
        continue;
      }
      if (!player.teamId) {
        // Free-agent youth (no team) — nothing to do.
        //
        // ⛔ This skip is DELIBERATE under the freeze, not an oversight.
        // It means such a player never accumulates `revealedSkills`, so
        // `PlayerService.promote()` (which requires ≥ 5 revealed) can
        // never be satisfied for them. In practice no such rows exist —
        // `youth-structure.generator.ts` only creates youth rows for
        // senior teams with a `leagueId`, and `scouts.selectCandidate`
        // always sets `teamId` — so this is defensive dead code rather
        // than a live defect. See *Known limitations* in `CLAUDE.md`
        // → "The promotion gate can never be satisfied for a team-less
        // youth" for why it is left alone rather than repaired.
        skippedNoTeam++;
        continue;
      }
      if ((player as { team?: TeamEntity }).team?.isBot) {
        skippedBot++;
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
    const actuallyProcessed =
      youth.length - skippedNoTeam - skippedBot - skippedNoSkills;
    this.logger.info(
      `[YouthProgressionProcessor] Done in ${duration}ms — ` +
        `scanned=${youth.length}, processed=${actuallyProcessed}, ` +
        `grew=${youthGrew}, revealed=${youthRevealed}, ` +
        `skipped(bot=${skippedBot}, noTeam=${skippedNoTeam}, noSkills=${skippedNoSkills})`,
    );

    return {
      // Count what was actually evaluated, not everything scanned.
      // `youth.length` previously included every skipped row, so the
      // weekly log line over-reported.
      youthProcessed: actuallyProcessed,
      youthGrew,
      youthRevealed,
    };
  }

  @OnWorkerEvent('completed')
  onCompleted(job: Job) {
    this.logger.debug(`Youth progression settlement job ${job.id} completed`);
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
