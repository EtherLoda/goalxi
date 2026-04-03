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
} from '@goalxi/database';

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
        const teamResult = await this.processTeamTraining(team.id);
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

  private async processTeamTraining(teamId: string): Promise<{
    playersProcessed: number;
    playersTrained: number;
  }> {
    // Get all active staff for bonus calculation
    const staffList = await this.staffRepo.find({
      where: { teamId, isActive: true },
    });

    // Get all players on the team
    const players = await this.playerRepo.find({
      where: { teamId },
    });

    let playersTrained = 0;

    for (const player of players) {
      // Skip youth players - they have separate training logic
      if (player.isYouth) {
        continue;
      }

      const result = applyTrainingToPlayer(
        player.id,
        player.age,
        player.currentSkills,
        player.potentialSkills,
        player.trainingSlot,
        player.trainingCategory,
        player.isGoalkeeper,
        staffList,
        1, // 1 week
        player.trainingSkill,
      );

      if (result.weeklyPoints > 0) {
        await this.playerRepo.save(player);
        playersTrained++;

        this.logger.debug(
          `[TrainingProcessor] Player ${player.name} (${player.id}): ` +
            `${result.weeklyPoints} pts, gained ${result.skillsGained.map((g) => g.skill).join(', ')}`,
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
