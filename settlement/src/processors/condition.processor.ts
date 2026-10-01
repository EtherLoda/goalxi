import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Injectable, Logger, Inject } from '@nestjs/common';
import { LOGGER_SERVICE, PinoLoggerService } from '@goalxi/logger';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Job } from 'bullmq';
import {
  PlayerEntity,
  StaffEntity,
  TeamEntity,
  FanEntity,
  StaffRole,
  Uuid,
  updatePlayerForm,
  ConditionInputs,
} from '@goalxi/database';

@Injectable()
@Processor('condition-settlement')
export class ConditionProcessor extends WorkerHost {
  constructor(
    @Inject(LOGGER_SERVICE)
    private readonly logger: PinoLoggerService,
    @InjectRepository(PlayerEntity)
    private playerRepo: Repository<PlayerEntity>,
    @InjectRepository(StaffEntity)
    private staffRepo: Repository<StaffEntity>,
    @InjectRepository(TeamEntity)
    private teamRepo: Repository<TeamEntity>,
    @InjectRepository(FanEntity)
    private fanRepo: Repository<FanEntity>,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {
    super();
  }

  async process(job: Job<any, any, string>): Promise<any> {
    this.logger.info(
      '[ConditionProcessor] Starting condition settlement processing...',
    );

    const startTime = Date.now();
    let totalPlayersProcessed = 0;

    try {
      // Get all teams. Loaded once — `processTeamCondition` used to
      // re-fetch each team by id, which was a redundant round trip per
      // team on top of a full table scan.
      const teams = await this.teamRepo.find();
      this.logger.info(`[ConditionProcessor] Processing ${teams.length} teams`);

      for (const team of teams) {
        const result = await this.processTeamCondition(team.id, team.isBot);
        totalPlayersProcessed += result.playersProcessed;
      }

      const duration = Date.now() - startTime;
      this.logger.info(
        `[ConditionProcessor] Condition settlement completed! ` +
          `${totalPlayersProcessed} players processed ` +
          `in ${duration}ms`,
      );

      return {
        teamsProcessed: teams.length,
        playersProcessed: totalPlayersProcessed,
        durationMs: duration,
      };
    } catch (error) {
      this.logger.error(
        `[ConditionProcessor] Condition settlement failed: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  private async processTeamCondition(
    teamId: string,
    isBot: boolean,
  ): Promise<{
    playersProcessed: number;
  }> {
    // Bot teams don't run the full form / minutes-accumulation loop
    // (their players' form and stamina are deliberately frozen at the
    // values seeded by `team-generator.service.ts`). They DO need a
    // `matchMinutes = 0` reset each tick, otherwise the field grows
    // without bound — `match-completion.service.ts` increments it on
    // every match and nothing else decrements it for bot squads.
    if (isBot) {
      await this.resetMatchMinutesForBotTeam(teamId);
      return { playersProcessed: 0 };
    }

    // Read-only context (head coach, fan, players) stays on the
    // injected non-tx repos so the transaction window is just the
    // batched player write. Same per-team isolation rationale as
    // TrainingProcessor: a bad row on team A must not roll back
    // team B's already-computed work.
    const headCoach = await this.staffRepo.findOne({
      where: { teamId, role: StaffRole.HEAD_COACH, isActive: true },
    });
    // NOTE: matches `TrainingProcessor`'s `?? 0` default for "no head
    // coach". These two previously disagreed (`?? 3` here vs `?? 0`
    // there) in the same tick, so a team without a head coach got two
    // different coach levels depending on which processor ran first.
    const headCoachLevel = headCoach?.level ?? 0;

    const fan = await this.fanRepo.findOne({ where: { teamId } });
    const fanEmotion = fan?.fanEmotion ?? 50;

    // Youth ARE included. They play youth fixtures on the same
    // `match` table and `match-completion.service.ts` increments
    // `matchMinutes` for every player in `tactics.lineupV2` regardless
    // of `isYouth` — so filtering them out here left youth
    // `matchMinutes` growing without bound, exactly the bug this bot
    // branch was added to fix.
    //
    // `updatePlayerForm` is a generic per-player weekly decay/recovery
    // and has no senior-specific inputs, so it is safe for youth. Their
    // skill growth is handled separately by `YouthProgressionProcessor`
    // (which also handles `revealLevel` sync).
    const players = await this.playerRepo.find({ where: { teamId } });

    if (players.length === 0) {
      return { playersProcessed: 0 };
    }

    const dirtyPlayers: PlayerEntity[] = [];
    for (const player of players) {
      // Use accumulated match minutes since last condition update
      const minutesPlayed = player.matchMinutes;

      // Prepare inputs for condition calculation
      const inputs: ConditionInputs = {
        currentForm: player.form,
        minutesPlayed,
        fanEmotion,
        headCoachLevel,
        currentInjuryValue: player.currentInjuryValue,
      };

      // Calculate new form
      const newForm = updatePlayerForm(inputs);

      // Update player form
      player.form = newForm;
      // Reset match minutes after condition update
      player.matchMinutes = 0;

      dirtyPlayers.push(player);

      this.logger.debug(
        `[ConditionProcessor] Player ${player.name}: form=${newForm.toFixed(2)}, minutes=${minutesPlayed}`,
      );
    }

    await this.dataSource.transaction(async (manager) => {
      const txPlayerRepo = manager.getRepository(PlayerEntity);
      await txPlayerRepo.save(dirtyPlayers);
    });

    return { playersProcessed: players.length };
  }

  /**
   * Reset `matchMinutes` to 0 for every player on a bot team. Bot
   * squads still get `matchMinutes` incremented by
   * `match-completion.service.ts` on each match they play; without this
   * reset the field grows without bound across the season.
   * Skips the form/stamina work because bot player state is meant to
   * stay frozen at the seeded values.
   *
   * Includes youth — `youth-structure.generator.ts` creates one
   * `youth_team` per EVERY senior team (bots included), and those
   * academy players play youth fixtures through the same
   * `match-completion` path, so they accumulate minutes too.
   */
  private async resetMatchMinutesForBotTeam(teamId: string): Promise<void> {
    const players = await this.playerRepo.find({ where: { teamId } });
    const dirty = players.filter((p) => p.matchMinutes !== 0);
    if (dirty.length === 0) return;
    for (const p of dirty) p.matchMinutes = 0;
    await this.dataSource.transaction(async (manager) => {
      await manager.getRepository(PlayerEntity).save(dirty);
    });
  }

  @OnWorkerEvent('completed')
  onCompleted(job: Job) {
    this.logger.debug(`Condition settlement job ${job.id} completed`);
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job, err: Error) {
    this.logger.error(
      `Condition settlement job ${job.id} failed: ${err.message}`,
    );
  }
}
