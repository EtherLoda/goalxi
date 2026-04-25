import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Job } from 'bullmq';
import {
  PlayerEntity,
  StaffEntity,
  TeamEntity,
  applyTrainingToPlayer,
  calculateWeeklyStaminaChange,
  calculateCoachBonus,
} from '@goalxi/database';
import {
  NotificationService,
  NotificationType,
} from '../notification/notification.service';

@Injectable()
@Processor('training-settlement')
export class TrainingProcessor extends WorkerHost {
  private readonly logger = new Logger(TrainingProcessor.name);

  constructor(
    @InjectRepository(PlayerEntity)
    private playerRepo: Repository<PlayerEntity>,
    @InjectRepository(StaffEntity)
    private staffRepo: Repository<StaffEntity>,
    @InjectRepository(TeamEntity)
    private teamRepo: Repository<TeamEntity>,
    private readonly notificationService: NotificationService,
  ) {
    super();
  }

  async process(job: Job<any, any, string>): Promise<any> {
    this.logger.log(
      '[TrainingProcessor] Starting training settlement processing...',
    );

    const startTime = Date.now();
    let totalPlayersProcessed = 0;
    let totalPlayersTrained = 0;

    try {
      // Get all teams
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
    // Skip bot teams - their players don't train
    if (team.isBot) {
      return { playersProcessed: 0, playersTrained: 0 };
    }

    // Get all active staff for bonus calculation
    const staffList = await this.staffRepo.find({
      where: { teamId: team.id, isActive: true },
    });

    // Get team's physical training intensity
    const physicalIntensity = team.trainingPhysicalIntensity ?? 0;

    // Calculate coach bonus for stamina (includes head + fitness coach)
    const fitnessCoachBonus = calculateCoachBonus(staffList, 'physical' as any);

    // Get all players on the team
    const players = await this.playerRepo.find({
      where: { teamId: team.id },
    });

    let playersTrained = 0;

    for (const player of players) {
      // Skip youth players - they have separate training logic
      if (player.isYouth) {
        continue;
      }

      // Calculate stamina change
      const staminaResult = calculateWeeklyStaminaChange(
        player.id,
        player.stamina,
        player.fractionalAge,
        physicalIntensity,
        fitnessCoachBonus,
      );
      player.stamina = staminaResult.staminaAfter;

      const result = applyTrainingToPlayer(
        player.id,
        player.fractionalAge,
        player.currentSkills,
        player.potentialSkills,
        player.trainingSlot,
        player.trainingCategory,
        player.isGoalkeeper,
        staffList,
        1, // 1 week
        player.trainingSkill,
        physicalIntensity,
      );

      if (result.weeklyPoints > 0 || staminaResult.netChange !== 0) {
        await this.playerRepo.save(player);
        playersTrained++;

        // Send notification for skill improvements
        if (result.skillsGained.length > 0 && team.userId) {
          for (const gain of result.skillsGained) {
            await this.notificationService.create(
              team.userId,
              NotificationType.PLAYER_SKILL_IMPROVED,
              'notification.playerSkillImproved',
              {
                playerId: player.id,
                playerName: player.name,
                skillType: gain.skill,
                oldValue:
                  (player.currentSkills as any)[gain.skill] - gain.levels,
                newValue: (player.currentSkills as any)[gain.skill],
                levels: gain.levels,
              },
            );
          }
        }

        this.logger.debug(
          `[TrainingProcessor] Player ${player.name} (${player.id}): ` +
            `stamina ${staminaResult.staminaBefore.toFixed(2)} → ${staminaResult.staminaAfter.toFixed(2)} ` +
            `(${staminaResult.netChange >= 0 ? '+' : ''}${staminaResult.netChange.toFixed(2)}), ` +
            `skill pts: ${result.weeklyPoints}, gained ${result.skillsGained.map((g) => g.skill).join(', ')}`,
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
