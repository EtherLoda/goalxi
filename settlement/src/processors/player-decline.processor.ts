import { Injectable, Inject, Optional } from '@nestjs/common';
import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Job } from 'bullmq';
import { LOGGER_SERVICE, PinoLoggerService } from '@goalxi/logger';
import { applyWeeklyDecline, PlayerEntity } from '@goalxi/database';

export interface PlayerDeclineResult {
  playersScanned: number;
  playersDeclined: number;
  hitFloorCount: number;
}

/**
 * Weekly senior-decline worker.
 *
 * Runs on **Monday 00:00 UTC**, four days before the regular Thursday
 * training settlement (kicked off by `WeeklySettlementService`). The
 * training tick on Thursday then naturally diffs the snapshot against
 * the post-decline skills and records the decline in
 * `TrainingUpdateEntity.playerUpdates[].changes`. We deliberately do
 * NOT write a `PlayerEventEntity` here — that decision was a scope
 * cut (see plan v2). The training diff is the user-visible surface.
 *
 * ## Filter
 * `is_youth = false` AND `team.is_bot = false`. Bot rosters must stay
 * frozen so the simulation's "BOTs retire as players arrive" design
 * (see `onboarding-assigner.ts`) keeps producing stable opponents.
 *
 * ## Failure model
 * Writes are batched into a single per-tick transaction. A failure
 * on player N rolls back players 1..N-1 (and the rest of the batch).
 * This is acceptable: a Monday decline that misses one week is
 * corrected by next Monday's tick — there is no irreversible state
 * here. The pre-existing youth-progression worker uses the same
 * "one big tx" pattern.
 */
@Injectable()
@Processor('senior-decline-settlement')
export class PlayerDeclineProcessor extends WorkerHost {
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
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _job: Job<unknown, unknown, string>,
  ): Promise<PlayerDeclineResult> {
    this.logger.info(
      '[PlayerDeclineProcessor] Starting senior decline settlement...',
    );
    const start = Date.now();

    // Scope: senior + non-bot. The team.isBot=false filter rides
    // on a `team` relation; we don't fetch the full team row to
    // keep the payload small, but TypeORM still has to join.
    const players = await this.playerRepo.find({
      where: { isYouth: false },
      relations: { team: true },
    });
    // Defensive bot filter in case the join missed an edge case
    // (a player row with a null team row, say). The DB WHERE
    // already excluded the obvious cases; this catches the rest.
    // Also defensively skip youth — the find WHERE is `isYouth:
    // false` but tests bypass it with a mock, so the in-memory
    // filter is the only thing standing between a youth and a
    // 0.011*a² decline.
    const seniorPlayers = players.filter(
      (p) =>
        p.team &&
        p.team.isBot === false &&
        p.isYouth === false,
    );
    this.logger.info(
      `[PlayerDeclineProcessor] Scanned ${players.length} player(s); ` +
        `${seniorPlayers.length} eligible (senior, non-bot)`,
    );

    const dirtyPlayers: PlayerEntity[] = [];
    let playersDeclined = 0;
    let hitFloorCount = 0;

    for (const player of seniorPlayers) {
      if (!player.currentSkills) continue;
      const result = applyWeeklyDecline(player, this.random);
      if (result.deltas.length === 0) continue;
      dirtyPlayers.push(player);
      playersDeclined++;
      if (result.hitFloor) hitFloorCount++;
      this.logger.debug(
        `[PlayerDeclineProcessor] Player ${player.name} ` +
          `(id=${player.id}, age=${player.age}): ` +
          `Δ${result.totalLost.toFixed(2)} across ` +
          `${result.deltas.length} skills` +
          (result.hitFloor ? ' [HIT FLOOR]' : ''),
      );
    }

    // Single batched commit. Same shape as YouthProgressionProcessor.
    if (dirtyPlayers.length > 0) {
      await this.dataSource.transaction(async (manager) => {
        await manager.getRepository(PlayerEntity).save(dirtyPlayers);
      });
    }

    const duration = Date.now() - start;
    this.logger.info(
      `[PlayerDeclineProcessor] Done in ${duration}ms — ` +
        `${playersDeclined}/${seniorPlayers.length} players declined, ` +
        `${hitFloorCount} hit skill floor`,
    );

    return {
      playersScanned: players.length,
      playersDeclined,
      hitFloorCount,
    };
  }

  @OnWorkerEvent('completed')
  onCompleted(job: Job) {
    this.logger.debug(`Senior decline settlement job ${job.id} completed`);
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job, err: Error) {
    this.logger.error(
      `Senior decline settlement job ${job.id} failed: ${err.message}`,
    );
  }
}
