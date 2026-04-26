import {
  calculateAssignedCoachBonus,
  calculateFitnessCoachBonus,
  calculatePlayerPWI,
  calculateSpecializedTrainingPoints,
  CoachPlayerAssignmentEntity,
  PlayerEntity,
  StaffEntity,
  TrainingUpdateEntity,
} from '@goalxi/database';
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';

@Injectable()
export class TrainingService {
  private readonly logger = new Logger(TrainingService.name);

  constructor(
    @InjectRepository(PlayerEntity)
    private playerRepo: Repository<PlayerEntity>,
    @InjectRepository(StaffEntity)
    private staffRepo: Repository<StaffEntity>,
    @InjectRepository(CoachPlayerAssignmentEntity)
    private assignmentRepo: Repository<CoachPlayerAssignmentEntity>,
    @InjectRepository(TrainingUpdateEntity)
    private trainingUpdateRepo: Repository<TrainingUpdateEntity>,
  ) {}

  /**
   * Calculate weekly training preview for all players on a team
   */
  async getWeeklyTrainingPreview(
    teamId: string,
    staminaIntensity: number,
  ): Promise<TrainingPreviewDto[]> {
    const staffList = await this.staffRepo.find({
      where: { teamId, isActive: true },
    });

    const fitnessBonus = calculateFitnessCoachBonus(staffList);

    const assignments =
      staffList.length > 0
        ? await this.assignmentRepo.find({
            where: {
              coachId: In(staffList.map((s) => s.id)),
            },
          })
        : [];

    const playerAssignmentMap = new Map<string, CoachPlayerAssignmentEntity>();
    for (const assignment of assignments) {
      if (!playerAssignmentMap.has(assignment.playerId)) {
        playerAssignmentMap.set(assignment.playerId, assignment);
      }
    }

    const players = await this.playerRepo.find({
      where: { teamId },
    });

    const previews: TrainingPreviewDto[] = [];

    for (const player of players) {
      if (player.isYouth) continue;

      const assignment = playerAssignmentMap.get(player.id);
      let weeklyPoints = 0;
      let assignedCoachId: string | undefined;
      let assignedCoachName: string | undefined;

      if (assignment) {
        const assignedCoach = staffList.find(
          (s) => s.id === assignment.coachId,
        );
        if (assignedCoach) {
          const coachBonus = calculateAssignedCoachBonus(
            staffList,
            assignedCoach.level,
          );
          weeklyPoints = calculateSpecializedTrainingPoints(
            player.fractionalAge,
            staminaIntensity,
            coachBonus,
          );
          assignedCoachId = assignedCoach.id;
          assignedCoachName = assignedCoach.name;
        }
      }

      // Build skill breakdown
      const skillBreakdown = this.buildSkillBreakdown(player);

      previews.push({
        playerId: player.id,
        playerName: player.name,
        assignedCoachId,
        assignedCoachName,
        age: player.age,
        stamina: Math.floor(player.stamina),
        condition: Math.floor(player.form),
        experience: Math.floor(player.experience),
        pwi: calculatePlayerPWI(player).pwi,
        weeklyPoints,
        skillBreakdown,
        isGoalkeeper: player.isGoalkeeper,
      });
    }

    return previews;
  }

  /**
   * Build skill breakdown from player entity
   */
  private buildSkillBreakdown(player: PlayerEntity): TrainingSkillDto[] {
    const breakdown: TrainingSkillDto[] = [];
    const { currentSkills, potentialSkills } = player;

    if (currentSkills?.physical) {
      for (const [skill, value] of Object.entries(currentSkills.physical)) {
        const pot =
          potentialSkills?.physical?.[
            skill as keyof typeof potentialSkills.physical
          ] ?? value;
        breakdown.push({
          skill,
          current: value ?? 0,
          potential: pot ?? 0,
          category: 'physical',
          remainingToPotential: (pot ?? 0) - (value ?? 0),
        });
      }
    }

    if (currentSkills?.technical) {
      for (const [skill, value] of Object.entries(currentSkills.technical)) {
        const pot =
          potentialSkills?.technical?.[
            skill as keyof typeof potentialSkills.technical
          ] ?? value;
        breakdown.push({
          skill,
          current: value ?? 0,
          potential: pot ?? 0,
          category: 'technical',
          remainingToPotential: (pot ?? 0) - (value ?? 0),
        });
      }
    }

    if (currentSkills?.mental) {
      for (const [skill, value] of Object.entries(currentSkills.mental)) {
        const pot =
          potentialSkills?.mental?.[
            skill as keyof typeof potentialSkills.mental
          ] ?? value;
        breakdown.push({
          skill,
          current: value ?? 0,
          potential: pot ?? 0,
          category: 'mental',
          remainingToPotential: (pot ?? 0) - (value ?? 0),
        });
      }
    }

    if (currentSkills?.setPieces) {
      for (const [skill, value] of Object.entries(currentSkills.setPieces)) {
        const pot =
          potentialSkills?.setPieces?.[
            skill as keyof typeof potentialSkills.setPieces
          ] ?? value;
        breakdown.push({
          skill,
          current: value ?? 0,
          potential: pot ?? 0,
          category: 'setPieces',
          remainingToPotential: (pot ?? 0) - (value ?? 0),
        });
      }
    }

    return breakdown;
  }

  /**
   * Get the latest training update for a team
   */
  async getLatestTrainingUpdate(
    teamId: string,
  ): Promise<TrainingUpdateEntity | null> {
    const update = await this.trainingUpdateRepo.findOne({
      where: { teamId },
      order: { createdAt: 'DESC' },
    });
    return update;
  }

  /**
   * Get training update for a team by season and week
   */
  async getTrainingUpdateBySeasonWeek(
    teamId: string,
    season: number,
    week: number,
  ): Promise<TrainingUpdateEntity | null> {
    const update = await this.trainingUpdateRepo.findOne({
      where: { teamId, season, week },
    });
    return update;
  }

  /**
   * Get all training update seasons/weeks available for a team
   */
  async getAvailableTrainingUpdates(
    teamId: string,
  ): Promise<{ season: number; week: number }[]> {
    const updates = await this.trainingUpdateRepo
      .createQueryBuilder('tu')
      .select('DISTINCT tu.season, tu.week')
      .where('tu.teamId = :teamId', { teamId })
      .orderBy('tu.season', 'DESC')
      .addOrderBy('tu.week', 'DESC')
      .getRawMany();
    return updates.map((u) => ({ season: u.tu_season, week: u.tu_week }));
  }
}

export interface TrainingSkillDto {
  skill: string;
  current: number;
  potential: number;
  category: string | null;
  remainingToPotential: number;
}

export interface TrainingPreviewDto {
  playerId: string;
  playerName: string;
  assignedCoachId?: string;
  assignedCoachName?: string;
  age: number;
  stamina: number;
  condition: number;
  experience: number;
  pwi: number;
  weeklyPoints: number;
  skillBreakdown: TrainingSkillDto[];
  isGoalkeeper: boolean;
}
