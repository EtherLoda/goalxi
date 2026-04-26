import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
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
  GAME_SETTINGS,
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
  private readonly logger = new Logger(TrainingProcessor.name);
  private readonly GAME_START_DATE = new Date('2026-04-06T00:00:00Z');

  constructor(
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
  ) {
    super();
  }

  private getCurrentSeasonWeek(): { season: number; week: number } {
    const now = new Date();
    const msPerWeek = 7 * 24 * 60 * 60 * 1000;
    const weeksElapsed = Math.floor(
      (now.getTime() - this.GAME_START_DATE.getTime()) / msPerWeek,
    );
    const season =
      Math.floor(weeksElapsed / GAME_SETTINGS.SEASON_LENGTH_WEEKS) + 1;
    const week = (weeksElapsed % GAME_SETTINGS.SEASON_LENGTH_WEEKS) + 1;
    return { season, week };
  }

  async process(job: Job<any, any, string>): Promise<any> {
    this.logger.log(
      '[TrainingProcessor] Starting training settlement processing...',
    );

    const startTime = Date.now();
    let totalPlayersProcessed = 0;
    let totalPlayersTrained = 0;

    try {
      const teams = await this.teamRepo.find();
      this.logger.log(`[TrainingProcessor] Processing ${teams.length} teams`);

      for (const team of teams) {
        const teamResult = await this.processTeamTraining(team);
        totalPlayersProcessed += teamResult.playersProcessed;
        totalPlayersTrained += teamResult.playersTrained;
      }

      const duration = Date.now() - startTime;
      this.logger.log(
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

    // Get all active staff for bonus calculation
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
    const playerAssignmentMap = new Map<string, CoachPlayerAssignmentEntity>();
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
    const playerSnapshots = new Map<string, PlayerSnapshot>();
    for (const player of players) {
      const skills: Record<string, number> = {};
      if (player.currentSkills) {
        // Flatten skills structure
        const cs = player.currentSkills as any;
        if (cs.physical) {
          for (const [k, v] of Object.entries(cs.physical)) {
            skills[k] = v as number;
          }
        }
        if (cs.technical) {
          for (const [k, v] of Object.entries(cs.technical)) {
            skills[k] = v as number;
          }
        }
        if (cs.mental) {
          for (const [k, v] of Object.entries(cs.mental)) {
            skills[k] = v as number;
          }
        }
        if (cs.setPieces) {
          for (const [k, v] of Object.entries(cs.setPieces)) {
            skills[k] = v as number;
          }
        }
      }
      playerSnapshots.set(player.id, {
        stamina: player.stamina,
        form: player.form,
        experience: player.experience,
        skills,
      });
    }

    let playersTrained = 0;
    const { season, week } = this.getCurrentSeasonWeek();

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

      // === SAVE RESULTS ===
      const weeklyPoints = trainingResult?.weeklyPoints ?? 0;
      const hasTraining = weeklyPoints > 0 || netStaminaChange !== 0;

      if (hasTraining) {
        await this.playerRepo.save(player);
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
      const currentSkills = player.currentSkills as any;
      if (currentSkills) {
        // Check physical skills
        if (currentSkills.physical) {
          for (const [skill, value] of Object.entries(currentSkills.physical)) {
            const oldValue = oldSnapshot.skills[skill] ?? 0;
            const oldFloor = Math.floor(oldValue);
            const newFloor = Math.floor(value as number);
            if (oldFloor !== newFloor) {
              changes.push({
                field: `skill:${skill}`,
                oldValue: oldFloor,
                newValue: newFloor,
              });
            }
          }
        }
        // Check technical skills
        if (currentSkills.technical) {
          for (const [skill, value] of Object.entries(
            currentSkills.technical,
          )) {
            const oldValue = oldSnapshot.skills[skill] ?? 0;
            const oldFloor = Math.floor(oldValue);
            const newFloor = Math.floor(value as number);
            if (oldFloor !== newFloor) {
              changes.push({
                field: `skill:${skill}`,
                oldValue: oldFloor,
                newValue: newFloor,
              });
            }
          }
        }
        // Check mental skills
        if (currentSkills.mental) {
          for (const [skill, value] of Object.entries(currentSkills.mental)) {
            const oldValue = oldSnapshot.skills[skill] ?? 0;
            const oldFloor = Math.floor(oldValue);
            const newFloor = Math.floor(value as number);
            if (oldFloor !== newFloor) {
              changes.push({
                field: `skill:${skill}`,
                oldValue: oldFloor,
                newValue: newFloor,
              });
            }
          }
        }
        // Check set pieces skills
        if (currentSkills.setPieces) {
          for (const [skill, value] of Object.entries(
            currentSkills.setPieces,
          )) {
            const oldValue = oldSnapshot.skills[skill] ?? 0;
            const oldFloor = Math.floor(oldValue);
            const newFloor = Math.floor(value as number);
            if (oldFloor !== newFloor) {
              changes.push({
                field: `skill:${skill}`,
                oldValue: oldFloor,
                newValue: newFloor,
              });
            }
          }
        }
      }

      if (changes.length > 0) {
        playerUpdates.push({
          playerId: player.id,
          playerName: player.name,
          changes,
        });
      }
    }

    // Create or update TrainingUpdateEntity if there are changes
    if (playerUpdates.length > 0 && team.userId) {
      const existing = await this.trainingUpdateRepo.findOne({
        where: { teamId: team.id, season, week },
      });
      if (existing) {
        existing.playerUpdates = playerUpdates;
        await this.trainingUpdateRepo.save(existing);
        this.logger.debug(
          `[TrainingProcessor] Updated training update for team ${team.id} S${season}W${week}: ${playerUpdates.length} players with changes`,
        );
      } else {
        const trainingUpdate = this.trainingUpdateRepo.create({
          teamId: team.id,
          season,
          week,
          playerUpdates,
        });
        await this.trainingUpdateRepo.save(trainingUpdate);
        this.logger.debug(
          `[TrainingProcessor] Created training update for team ${team.id} S${season}W${week}: ${playerUpdates.length} players with changes`,
        );
      }
    }

    return {
      playersProcessed: players.length,
      playersTrained,
    };
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
