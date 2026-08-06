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
  CoachPlayerAssignmentEntity,
  TrainingUpdateEntity,
  PlayerTrainingChange,
  TrainingResult,
  calculateWeeklyStaminaChange,
  calculateStaminaGain,
  calculateFitnessCoachBonus,
  calculateAssignedCoachBonus,
  applySpecializedTraining,
  calculateDecay,
  currentSeasonWeek,
  resolveGameStart,
} from '@goalxi/database';
import {
  NotificationService,
  NotificationType,
} from '../notification/notification.service';

interface PlayerSnapshot {
  stamina: number;
  form: number;
  experience: number;
  skills: Record<string, number>;
}

@Injectable()
@Processor('training-settlement')
export class TrainingProcessor extends WorkerHost {
  // Resolved once at construction so a single instance reports
  // the same season/week for every job in its lifetime, even if a
  // long-running tick straddles a week boundary. Caller threads
  // `process.env.GAME_START_DATE` via main.ts WARN log on miss.
  private readonly gameStart: Date;

  constructor(
    @Inject(LOGGER_SERVICE)
    private readonly logger: PinoLoggerService,
    @InjectRepository(PlayerEntity)
    private playerRepo: Repository<PlayerEntity>,
    @InjectRepository(StaffEntity)
    private staffRepo: Repository<StaffEntity>,
    @InjectRepository(TeamEntity)
    private teamRepo: Repository<TeamEntity>,
    @InjectRepository(CoachPlayerAssignmentEntity)
    private assignmentRepo: Repository<CoachPlayerAssignmentEntity>,
    @InjectRepository(TrainingUpdateEntity)
    private trainingUpdateRepo: Repository<TrainingUpdateEntity>,
    private readonly notificationService: NotificationService,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {
    super();
    this.gameStart = resolveGameStart(process.env.GAME_START_DATE);
  }

  // Single source of truth for "what season/week is it right now?".
  // The shared pure function lives in @goalxi/database so api,
  // settlement and simulator all agree on the answer.
  private getCurrentSeasonWeek(): { season: number; week: number } {
    return currentSeasonWeek(new Date(), this.gameStart);
  }

  async process(job: Job<any, any, string>): Promise<any> {
    this.logger.info(
      '[TrainingProcessor] Starting training settlement processing...',
    );

    const startTime = Date.now();
    let totalPlayersProcessed = 0;
    let totalPlayersTrained = 0;

    try {
      const teams = await this.teamRepo.find();
      this.logger.info(`[TrainingProcessor] Processing ${teams.length} teams`);

      for (const team of teams) {
        const teamResult = await this.processTeamTraining(team);
        totalPlayersProcessed += teamResult.playersProcessed;
        totalPlayersTrained += teamResult.playersTrained;
      }

      const duration = Date.now() - startTime;
      this.logger.info(
        `[TrainingProcessor] Training settlement completed! ` +
          `${totalPlayersTrained}/${totalPlayersProcessed} players received training ` +
          `in ${duration}ms`,
      );

      return {
        teamsProcessed: teams.length,
        playersProcessed: totalPlayersProcessed,
        playersTrained: totalPlayersTrained,
        durationMs: duration,
      };
    } catch (error) {
      this.logger.error(
        `[TrainingProcessor] Training settlement failed: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  private async processTeamTraining(team: TeamEntity): Promise<{
    playersProcessed: number;
    playersTrained: number;
  }> {
    // Skip bot teams
    if (team.isBot) {
      return { playersProcessed: 0, playersTrained: 0 };
    }

    // Per-team transaction: a bad row on team A must not roll
    // back team B's already-computed work, and committing each
    // team in one shot keeps the read snapshot tight. Read-only
    // queries still go through the injected (non-tx) repos to
    // avoid holding row locks while we walk N players.
    const staffList = await this.staffRepo.find({
      where: { teamId: team.id, isActive: true },
    });

    // Get team's stamina training intensity
    const staminaIntensity = team.staminaTrainingIntensity ?? 0.1;

    // Calculate fitness coach bonus for stamina recovery
    const fitnessCoachBonus = calculateFitnessCoachBonus(staffList);

    // Get all coach-player assignments for this team
    const assignments = await this.assignmentRepo.find({
      where: {
        coachId: staffList.map((s) => s.id) as any,
      },
    });

    // Create a map: playerId -> assignment
    const playerAssignmentMap = new Map<number, CoachPlayerAssignmentEntity>();
    for (const assignment of assignments) {
      // Each player should only have one active assignment
      if (!playerAssignmentMap.has(assignment.playerId)) {
        playerAssignmentMap.set(assignment.playerId, assignment);
      }
    }

    // Get all players on the team
    const players = await this.playerRepo.find({
      where: { teamId: team.id },
    });

    // Snapshot old values before processing
    const playerSnapshots = new Map<number, PlayerSnapshot>();
    for (const player of players) {
      const skills: Record<string, number> = {};
      this.forEachSkill(player.currentSkills, (key, value) => {
        skills[key] = value;
      });
      playerSnapshots.set(player.id, {
        stamina: player.stamina,
        form: player.form,
        experience: player.experience,
        skills,
      });
    }

    let playersTrained = 0;
    const { season, week } = this.getCurrentSeasonWeek();
    const dirtyPlayers: PlayerEntity[] = [];

    for (const player of players) {
      // Skip youth players
      if (player.isYouth) {
        continue;
      }

      // === STAMINA CALCULATION (ALL PLAYERS) ===
      const staminaGain = calculateStaminaGain(
        staminaIntensity,
        fitnessCoachBonus,
      );
      const decay = calculateDecay(player.fractionalAge, player.stamina);
      const netStaminaChange = staminaGain - decay;

      const newStamina = Math.max(
        0,
        Math.min(5.99, player.stamina + netStaminaChange),
      );
      player.stamina = Math.round(newStamina * 100) / 100;

      // === SPECIALIZED TRAINING (ASSIGNED PLAYERS ONLY) ===
      const assignment = playerAssignmentMap.get(player.id);
      let trainingResult: TrainingResult | null = null;

      if (assignment) {
        const assignedCoach = staffList.find(
          (s) => s.id === assignment.coachId,
        );
        if (assignedCoach) {
          const assignedCoachBonus = calculateAssignedCoachBonus(
            staffList,
            assignedCoach.level,
          );

          trainingResult = applySpecializedTraining(
            player.id,
            player.fractionalAge,
            player.currentSkills,
            player.potentialSkills,
            player.isGoalkeeper,
            staminaIntensity,
            assignedCoachBonus,
            1, // 1 week
            assignedCoach.trainedSkill, // Use coach's specific trained skill
          );
        }
      }

      // === COLLECT DIRTY PLAYERS (batched save below) ===
      const weeklyPoints = trainingResult?.weeklyPoints ?? 0;
      const hasTraining = weeklyPoints > 0 || netStaminaChange !== 0;

      if (hasTraining) {
        dirtyPlayers.push(player);
        playersTrained++;

        this.logger.debug(
          `[TrainingProcessor] Player ${player.name} (${player.id}): ` +
            `stamina ${player.stamina.toFixed(2)} (${netStaminaChange >= 0 ? '+' : ''}${netStaminaChange.toFixed(2)}), ` +
            `specialized pts: ${weeklyPoints}`,
        );
      }
    }

    // Build playerUpdates after all players processed
    const playerUpdates: PlayerTrainingChange[] = [];

    for (const player of players) {
      if (player.isYouth) continue;

      const oldSnapshot = playerSnapshots.get(player.id);
      if (!oldSnapshot) continue;

      const changes: { field: string; oldValue: number; newValue: number }[] =
        [];

      // Check stamina change
      const oldStaminaFloor = Math.floor(oldSnapshot.stamina);
      const newStaminaFloor = Math.floor(player.stamina);
      if (oldStaminaFloor !== newStaminaFloor) {
        changes.push({
          field: 'stamina',
          oldValue: oldStaminaFloor,
          newValue: newStaminaFloor,
        });
      }

      // Check form change
      const oldFormFloor = Math.floor(oldSnapshot.form);
      const newFormFloor = Math.floor(player.form);
      if (oldFormFloor !== newFormFloor) {
        changes.push({
          field: 'form',
          oldValue: oldFormFloor,
          newValue: newFormFloor,
        });
      }

      // Check skills
      this.forEachSkill(player.currentSkills, (skill, value) => {
        const oldValue = oldSnapshot.skills[skill] ?? 0;
        const oldFloor = Math.floor(oldValue);
        const newFloor = Math.floor(value);
        if (oldFloor !== newFloor) {
          changes.push({
            field: `skill:${skill}`,
            oldValue: oldFloor,
            newValue: newFloor,
          });
        }
      });

      if (changes.length > 0) {
        playerUpdates.push({
          playerId: player.id,
          playerName: player.name,
          changes,
        });
      }
    }

    // Commit everything for this team in one transaction. Read
    // queries above already used the non-tx repos so the tx
    // window is just the writes.
    await this.dataSource.transaction(async (manager) => {
      const txPlayerRepo = manager.getRepository(PlayerEntity);
      const txTrainingUpdateRepo = manager.getRepository(TrainingUpdateEntity);

      if (dirtyPlayers.length > 0) {
        // Single batched UPDATE/INSERT instead of one per player.
        await txPlayerRepo.save(dirtyPlayers);
      }

      if (playerUpdates.length > 0 && team.userId) {
        const existing = await txTrainingUpdateRepo.findOne({
          where: { teamId: team.id, season, week },
        });
        if (existing) {
          existing.playerUpdates = playerUpdates;
          await txTrainingUpdateRepo.save(existing);
          this.logger.debug(
            `[TrainingProcessor] Updated training update for team ${team.id} S${season}W${week}: ${playerUpdates.length} players with changes`,
          );
        } else {
          const trainingUpdate = txTrainingUpdateRepo.create({
            teamId: team.id,
            season,
            week,
            playerUpdates,
          });
          await txTrainingUpdateRepo.save(trainingUpdate);
          this.logger.debug(
            `[TrainingProcessor] Created training update for team ${team.id} S${season}W${week}: ${playerUpdates.length} players with changes`,
          );
        }
      }
    });

    return {
      playersProcessed: players.length,
      playersTrained,
    };
  }

  /**
   * Walk every (skill, value) pair across the four skill categories
   * on a `currentSkills` payload. Used by both the snapshot pass
   * (flatten into a single record) and the diff pass (compare to
   * the snapshot and emit a `PlayerTrainingChange`). Centralising
   * the traversal means adding a fifth category later (or renaming
   * one) is a one-line change in this method.
   */
  private forEachSkill(
    currentSkills: unknown,
    fn: (key: string, value: number) => void,
  ): void {
    if (!currentSkills) return;
    const skills = currentSkills as Record<string, Record<string, number> | undefined>;
    for (const category of ['physical', 'technical', 'mental', 'setPieces'] as const) {
      const sub = skills[category];
      if (!sub) continue;
      for (const [key, value] of Object.entries(sub)) {
        fn(key, value as number);
      }
    }
  }

  @OnWorkerEvent('completed')
  onCompleted(job: Job) {
    this.logger.debug(`Training settlement job ${job.id} completed`);
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job, err: Error) {
    this.logger.error(
      `Training settlement job ${job.id} failed: ${err.message}`,
    );
  }
}
