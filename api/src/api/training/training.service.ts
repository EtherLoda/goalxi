import {
  calculatePlayerPWI,
  computeWeeklyTrainingPoints,
  CoachAssignmentInput,
  CoachPlayerAssignmentEntity,
  PlayerEntity,
  StaffEntity,
  StaffRole,
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
   * Calculate weekly training preview for all players on a team.
   *
   * The weekly-points math goes through `computeWeeklyTrainingPoints`
   * — the SAME pure helper the settlement worker uses — so the number
   * the manager sees on the training page can never disagree with the
   * number actually applied to the player in the Thursday tick.
   */
  async getWeeklyTrainingPreview(
    teamId: string,
    staminaIntensity: number,
  ): Promise<TrainingPreviewDto[]> {
    const staffList = await this.staffRepo.find({
      where: { teamId, isActive: true },
    });

    // Head-coach level is read once per call. The shared helper takes
    // it as a plain number so it stays pure.
    const headCoachLevel =
      staffList.find((s) => s.role === StaffRole.HEAD_COACH)?.level ?? 0;

    const assignments =
      staffList.length > 0
        ? await this.assignmentRepo.find({
            where: {
              coachId: In(staffList.map((s) => s.id)),
            },
          })
        : [];

    // A player can be assigned to up to one coach PER CATEGORY
    // (physical/technical/mental/setPieces/goalkeeper). Keep the full
    // list per player so the weekly-points total reflects every
    // active coach's bonus. The single-Map fallback below matches
    // the settlement worker's data shape.
    const playerAssignments = new Map<number, CoachPlayerAssignmentEntity[]>();
    for (const assignment of assignments) {
      const list = playerAssignments.get(assignment.playerId) ?? [];
      list.push(assignment);
      playerAssignments.set(assignment.playerId, list);
    }

    const players = await this.playerRepo.find({
      where: { teamId },
    });

    const previews: TrainingPreviewDto[] = [];

    for (const player of players) {
      if (player.isYouth) continue;

      // Resolve every active coach assigned to this player in one
      // pass, then hand the slim CoachAssignmentInput[] to the shared
      // helper. Inactive / fired coaches are silently skipped — they
      // show up in the assignment table but contribute nothing.
      const myAssignments = playerAssignments.get(player.id) ?? [];
      const coachInputs: CoachAssignmentInput[] = [];
      let firstCoachId: string | undefined;
      let firstCoachName: string | undefined;
      for (const assignment of myAssignments) {
        const assignedCoach = staffList.find(
          (s) => s.id === assignment.coachId,
        );
        if (!assignedCoach) continue;
        coachInputs.push({
          level: assignedCoach.level,
          trainedSkill: assignedCoach.trainedSkill,
        });
        if (!firstCoachId) {
          firstCoachId = assignedCoach.id;
          firstCoachName = assignedCoach.name;
        }
      }

      const weeklyPoints = computeWeeklyTrainingPoints(
        player.fractionalAge,
        staminaIntensity,
        headCoachLevel,
        coachInputs,
      );

      // Build skill breakdown
      const skillBreakdown = this.buildSkillBreakdown(player);

      previews.push({
        playerId: player.id,
        playerName: player.name,
        assignedCoachId: firstCoachId,
        assignedCoachName: firstCoachName,
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
  playerId: number;
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
