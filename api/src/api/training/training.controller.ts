import {
  CoachPlayerAssignmentEntity,
  PlayerEntity,
  StaffEntity,
  TeamEntity,
  TrainingUpdateEntity,
  Uuid,
} from '@goalxi/database';
import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CurrentUser } from '../../decorators/current-user.decorator';
import { AuthGuard } from '../../guards/auth.guard';
import { StaffsService } from '../staffs/staffs.service';
import { TrainingService } from './training.service';

@Controller({ path: 'training', version: '1' })
@UseGuards(AuthGuard)
export class TrainingController {
  constructor(
    private readonly trainingService: TrainingService,
    private readonly staffsService: StaffsService,
    @InjectRepository(TeamEntity)
    private teamRepo: Repository<TeamEntity>,
    @InjectRepository(PlayerEntity)
    private playerRepo: Repository<PlayerEntity>,
    @InjectRepository(StaffEntity)
    private staffRepo: Repository<StaffEntity>,
    @InjectRepository(CoachPlayerAssignmentEntity)
    private assignmentRepo: Repository<CoachPlayerAssignmentEntity>,
    @InjectRepository(TrainingUpdateEntity)
    private trainingUpdateRepo: Repository<TrainingUpdateEntity>,
  ) {}

  /** Get weekly training preview for current user's team */
  @Get('weekly-points')
  async getWeeklyPoints(@CurrentUser('id') userId: Uuid): Promise<any[]> {
    const team = await this.teamRepo.findOneBy({ userId });
    if (!team) return [];

    return this.trainingService.getWeeklyTrainingPreview(
      team.id,
      team.staminaTrainingIntensity,
    );
  }

  /** Get training status for a specific player */
  @Get('player/:id')
  async getPlayerTraining(
    @Param('id') playerId: string,
    @CurrentUser('id') userId: Uuid,
  ): Promise<any> {
    const player = await this.playerRepo.findOne({
      where: { id: playerId as Uuid },
    });
    if (!player) {
      return null;
    }

    const team = await this.teamRepo.findOneBy({ userId });
    if (!team || player.teamId !== team.id) {
      return null;
    }

    const previews = await this.trainingService.getWeeklyTrainingPreview(
      team.id,
      team.staminaTrainingIntensity,
    );

    return previews.find((p) => p.playerId === playerId);
  }

  /** Get the latest training update for current user's team */
  @Get('latest-update')
  async getLatestUpdate(@CurrentUser('id') userId: Uuid): Promise<any | null> {
    const team = await this.teamRepo.findOneBy({ userId });
    if (!team) return null;

    return this.trainingService.getLatestTrainingUpdate(team.id);
  }

  /** Get training update by season and week */
  @Get('update/:season/:week')
  async getUpdateBySeasonWeek(
    @Param('season') season: number,
    @Param('week') week: number,
    @CurrentUser('id') userId: Uuid,
  ): Promise<any | null> {
    const team = await this.teamRepo.findOneBy({ userId });
    if (!team) return null;

    return this.trainingService.getTrainingUpdateBySeasonWeek(
      team.id,
      season,
      week,
    );
  }

  /** Get available training update seasons/weeks */
  @Get('available-updates')
  async getAvailableUpdates(
    @CurrentUser('id') userId: Uuid,
  ): Promise<{ season: number; week: number }[]> {
    const team = await this.teamRepo.findOneBy({ userId });
    if (!team) return [];

    return this.trainingService.getAvailableTrainingUpdates(team.id);
  }
}
