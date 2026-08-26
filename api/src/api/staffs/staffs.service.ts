import {
  CoachPlayerAssignmentEntity,
  currentSeasonWeek,
  FinanceEntity,
  getMaxPlayersForRole,
  getTrainingCategoryForRole,
  PlayerEntity,
  resolveInitDate,
  SKILL_CATEGORY_MAP,
  StaffEntity,
  StaffLevel,
  StaffRole,
  TeamEntity,
  TransactionType,
  Uuid,
} from '@goalxi/database';
import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, LessThanOrEqual, Repository } from 'typeorm';
import { FinanceService } from '../finance/finance.service';

export const STAFF_SALARY: Record<StaffLevel, number> = {
  [StaffLevel.LEVEL_1]: 500,
  [StaffLevel.LEVEL_2]: 2000,
  [StaffLevel.LEVEL_3]: 8000,
  [StaffLevel.LEVEL_4]: 32000,
  [StaffLevel.LEVEL_5]: 128000,
};

/** Signing fee = 16 weeks of salary */
export function getSigningFee(level: StaffLevel): number {
  return STAFF_SALARY[level] * 16;
}

export const STAFF_LEVEL_SCORE: Record<StaffLevel, number> = {
  [StaffLevel.LEVEL_1]: 40,
  [StaffLevel.LEVEL_2]: 55,
  [StaffLevel.LEVEL_3]: 70,
  [StaffLevel.LEVEL_4]: 85,
  [StaffLevel.LEVEL_5]: 100,
};

@Injectable()
export class StaffsService implements OnModuleInit {
  private readonly logger = new Logger(StaffsService.name);
  // Resolved once on `onModuleInit` from
  // `system_config.init_date` (with `GAME_START_DATE` env
  // as the override / fallback). The historical code
  // resolved from the env var only, which silently
  // shadowed the DB row after the first init — a restart
  // of the API with no env var landed on "today UTC
  // midnight" even though the row said otherwise. The
  // async resolution happens on `onModuleInit` so the
  // DataSource is wired before the read.
  private gameStart!: Date;

  constructor(
    @InjectRepository(StaffEntity)
    private staffRepo: Repository<StaffEntity>,
    @InjectRepository(TeamEntity)
    private teamRepo: Repository<TeamEntity>,
    @InjectRepository(FinanceEntity)
    private financeRepo: Repository<FinanceEntity>,
    @InjectRepository(CoachPlayerAssignmentEntity)
    private assignmentRepo: Repository<CoachPlayerAssignmentEntity>,
    @InjectRepository(PlayerEntity)
    private playerRepo: Repository<PlayerEntity>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly financeService: FinanceService,
  ) {}

  async onModuleInit(): Promise<void> {
    this.gameStart = await resolveInitDate(
      this.dataSource.manager,
      process.env.GAME_START_DATE,
    );
  }

  /** Get all staff for a team */
  async findByTeam(teamId: string): Promise<StaffEntity[]> {
    return this.staffRepo.find({
      where: { teamId, isActive: true },
      order: { role: 'ASC' },
    });
  }

  /**
   * Get the active team doctor for a team, if any.
   * Returns the highest-level active doctor; null when the team has none.
   */
  async findDoctorByTeam(teamId: string): Promise<StaffEntity | null> {
    return this.staffRepo.findOne({
      where: {
        teamId,
        role: StaffRole.TEAM_DOCTOR,
        isActive: true,
      },
      order: { level: 'DESC' },
    });
  }

  /** Get single staff */
  async findOne(id: string): Promise<StaffEntity> {
    const staff = await this.staffRepo.findOne({ where: { id } });
    if (!staff) throw new NotFoundException('Staff not found');
    return staff;
  }

  /** Sign a new staff contract */
  async hire(
    teamId: string,
    role: StaffRole,
    level: StaffLevel,
    userId: string,
    trainedSkill?: string,
  ): Promise<StaffEntity> {
    // Validate trainedSkill if provided
    if (trainedSkill) {
      const category = getTrainingCategoryForRole(role);
      const validSkills = SKILL_CATEGORY_MAP[category] || [];
      if (!validSkills.includes(trainedSkill)) {
        throw new BadRequestException(
          `Invalid trained skill "${trainedSkill}" for role ${role}. Valid skills: ${validSkills.join(', ')}`,
        );
      }
    }
    // Check if role already filled
    const existing = await this.staffRepo.findOne({
      where: { teamId, role, isActive: true },
    });
    if (existing) {
      throw new BadRequestException(`Team already has an active ${role}`);
    }

    // Check specialized coach limit (max 2, excluding HEAD_COACH, TEAM_DOCTOR, and FITNESS_COACH)
    const specializedRoles = [
      StaffRole.PSYCHOLOGY_COACH,
      StaffRole.TECHNICAL_COACH,
      StaffRole.SET_PIECE_COACH,
      StaffRole.GOALKEEPER_COACH,
    ];
    if (specializedRoles.includes(role)) {
      const activeSpecializedCoaches = await this.staffRepo.find({
        where: { teamId, isActive: true },
      });
      const currentSpecializedCount = activeSpecializedCoaches.filter((s) =>
        specializedRoles.includes(s.role),
      ).length;
      if (currentSpecializedCount >= 2) {
        throw new BadRequestException(
          '球队最多只能有2个专项教练（技术/心理/定位球/门将）',
        );
      }
    }

    // Check finance
    const signingFee = getSigningFee(level);
    const team = await this.teamRepo.findOne({ where: { id: teamId as Uuid } });
    if (!team) throw new NotFoundException('Team not found');

    const finance = await this.financeRepo.findOne({
      where: { teamId: teamId as Uuid },
    });
    if (!finance || finance.balance < signingFee) {
      throw new BadRequestException('Insufficient funds');
    }

    // Get current season and week
    const { season, week } = this.getCurrentSeasonWeek();

    // Create staff - contract is 1 season (16 weeks)
    const contractExpiry = new Date();
    contractExpiry.setDate(contractExpiry.getDate() + 16 * 7);

    const staff = this.staffRepo.create({
      teamId,
      name: this.generateStaffName(role, level),
      role,
      level,
      salary: STAFF_SALARY[level],
      contractExpiry,
      autoRenew: true,
      isActive: true,
      trainedSkill,
    });

    await this.staffRepo.save(staff);

    // Record signing fee transaction (non-critical, staff already created)
    try {
      await this.financeService.processTransaction(
        teamId as Uuid,
        -signingFee,
        TransactionType.STAFF_EXPENSES,
        season,
        week,
        `Signing fee for ${staff.name} (${role})`,
        staff.id,
      );
    } catch (error) {
      this.logger.error('Failed to record signing fee transaction', error);
      // Don't throw - staff was already created
    }

    return staff;
  }

  /** Fire a staff member - pay termination fee */
  async fire(staffId: string, userId: string): Promise<void> {
    const staff = await this.findOne(staffId);
    if (!staff.isActive)
      throw new BadRequestException('Staff already inactive');

    // Get current season and week
    const { season, week } = this.getCurrentSeasonWeek();

    // First, unassign all players from this coach
    const assignments = await this.assignmentRepo.find({
      where: { coachId: staffId },
    });
    for (const assignment of assignments) {
      await this.assignmentRepo.remove(assignment);
    }

    // Calculate termination fee
    const now = new Date();
    const remainingMs = staff.contractExpiry.getTime() - now.getTime();
    if (remainingMs <= 0) {
      // Contract expired, no fee needed
      staff.isActive = false;
      await this.staffRepo.save(staff);
      return;
    }

    const remainingWeeks = Math.max(
      1,
      Math.ceil(remainingMs / (7 * 24 * 60 * 60 * 1000)),
    );
    const terminationFee = remainingWeeks * staff.salary * 2;

    const finance = await this.financeRepo.findOne({
      where: { teamId: staff.teamId as Uuid },
    });
    if (!finance || finance.balance < terminationFee) {
      throw new BadRequestException('Insufficient funds for termination fee');
    }

    // Deactivate staff
    staff.isActive = false;
    await this.staffRepo.save(staff);

    // Record termination fee transaction (non-critical, staff already deactivated)
    try {
      await this.financeService.processTransaction(
        staff.teamId as Uuid,
        -terminationFee,
        TransactionType.STAFF_EXPENSES,
        season,
        week,
        `Termination fee for ${staff.name} (${staff.role})`,
        staff.id,
      );
    } catch (error) {
      this.logger.error('Failed to record termination fee transaction', error);
      // Don't throw - staff was already deactivated
    }
  }

  /** Toggle auto-renewal */
  async setAutoRenew(
    staffId: string,
    autoRenew: boolean,
  ): Promise<StaffEntity> {
    const staff = await this.findOne(staffId);
    staff.autoRenew = autoRenew;
    return this.staffRepo.save(staff);
  }

  /** Update a coach's trained skill.
   *
   * Senior coaches validate `trainedSkill` against the role's fixed
   * category's skill list (e.g. a FITNESS_COACH can pick any of
   * `['pace', 'strength']`). The historical YOUTH_COACH role is no
   * longer hireable, so the category-pick branch was removed. */
  async updateTrainedSkill(
    staffId: string,
    trainedSkill: string | null,
  ): Promise<StaffEntity> {
    const staff = await this.findOne(staffId);

    if (trainedSkill) {
      const category = getTrainingCategoryForRole(staff.role);
      const validSkills = SKILL_CATEGORY_MAP[category] || [];
      if (!validSkills.includes(trainedSkill)) {
        throw new BadRequestException(
          `Invalid trained skill "${trainedSkill}" for role ${staff.role}. Valid skills: ${validSkills.join(', ')}`,
        );
      }
    }

    staff.trainedSkill = trainedSkill || undefined;
    return this.staffRepo.save(staff);
  }

  /** Assign a player to a coach.
   *
   * Every coach role resolves the assignment's `trainingCategory`
   * from their own `StaffRole` via `getTrainingCategoryForRole` —
   * the YOUTH_COACH path is gone.
   */
  async assignPlayer(
    coachId: string,
    playerId: number,
  ): Promise<CoachPlayerAssignmentEntity> {
    const coach = await this.findOne(coachId);
    if (!coach.isActive) {
      throw new BadRequestException('Cannot assign player to inactive coach');
    }

    const player = await this.playerRepo.findOne({
      where: { id: playerId },
    });
    if (!player) {
      throw new NotFoundException('Player not found');
    }

    // Goalkeeper coaches can only train goalkeepers
    if (coach.role === 'goalkeeper_coach' && !player.isGoalkeeper) {
      throw new BadRequestException(
        'Goalkeeper coaches can only train goalkeepers',
      );
    }

    const maxPlayers = getMaxPlayersForRole(coach.role);

    // Check current assignments for this coach
    const currentAssignments = await this.assignmentRepo.count({
      where: { coachId },
    });
    if (currentAssignments >= maxPlayers) {
      throw new BadRequestException(
        `Coach can only manage ${maxPlayers} players`,
      );
    }

    // Check if player already assigned to this coach
    const existingAssignment = await this.assignmentRepo.findOne({
      where: { coachId, playerId },
    });
    if (existingAssignment) {
      throw new BadRequestException('Player already assigned to this coach');
    }

    // Resolve the training category for this assignment. Every role
    // owns a fixed category now (see `getTrainingCategoryForRole`).
    const trainingCategory = getTrainingCategoryForRole(coach.role);

    if (!trainingCategory) {
      throw new BadRequestException(
        `Coach role ${coach.role} has no resolvable training category`,
      );
    }

    // Check training category conflict - player can only have one coach per category
    // If conflict exists with a different coach, auto-unassign from the old coach first
    const conflictingAssignment = await this.assignmentRepo.findOne({
      where: { playerId, trainingCategory },
    });
    if (conflictingAssignment) {
      if (conflictingAssignment.coachId !== coachId) {
        // Auto-unassign from the old coach in the same category
        await this.assignmentRepo.remove(conflictingAssignment);
      }
    }

    const assignment = this.assignmentRepo.create({
      coachId,
      playerId,
      trainingCategory,
    });
    return this.assignmentRepo.save(assignment);
  }

  /** Unassign a player from a coach */
  async unassignPlayer(coachId: string, playerId: number): Promise<void> {
    const assignment = await this.assignmentRepo.findOne({
      where: { coachId, playerId },
    });
    if (!assignment) {
      throw new NotFoundException('Assignment not found');
    }
    await this.assignmentRepo.remove(assignment);
  }

  /** Get all assignments for a coach */
  async getAssignmentsByCoach(
    coachId: string,
  ): Promise<CoachPlayerAssignmentEntity[]> {
    return this.assignmentRepo.find({
      where: { coachId },
      relations: ['player'],
    });
  }

  /** Get all assignments for a player */
  async getAssignmentsByPlayer(
    playerId: number,
  ): Promise<CoachPlayerAssignmentEntity[]> {
    return this.assignmentRepo.find({
      where: { playerId },
      relations: ['coach'],
    });
  }

  /** Get assignment count for a coach */
  async getAssignmentCount(coachId: string): Promise<number> {
    return this.assignmentRepo.count({ where: { coachId } });
  }

  /** Process contract renewals at season end */
  async processSeasonEnd(): Promise<{ renewed: number; expired: number }> {
    const now = new Date();
    const expiring = await this.staffRepo.find({
      where: { contractExpiry: LessThanOrEqual(now), isActive: true },
    });

    let renewed = 0;
    let expired = 0;

    for (const staff of expiring) {
      if (staff.autoRenew) {
        // Renew for another season (16 weeks)
        const newExpiry = new Date();
        newExpiry.setDate(newExpiry.getDate() + 16 * 7);
        staff.contractExpiry = newExpiry;
        await this.staffRepo.save(staff);
        renewed++;
      } else {
        staff.isActive = false;
        await this.staffRepo.save(staff);
        expired++;
      }
    }

    return { renewed, expired };
  }

  // Single source of truth for season/week. Delegates to the
  // shared pure function in @goalxi/database so this API and
  // every settlement cron handler agree on the value.
  private getCurrentSeasonWeek(): { season: number; week: number } {
    // `onModuleInit` populates `gameStart` before any HTTP
    // request is served (Nest awaits all `onModuleInit`
    // hooks before binding the HTTP listener). Same
    // lifecycle contract as `GameStateService`.
    if (!this.gameStart) {
      throw new Error(
        'StaffsService.gameStart is unset — onModuleInit did not run. ' +
          'This is a Nest lifecycle bug, not a runtime condition.',
      );
    }
    return currentSeasonWeek(new Date(), this.gameStart);
  }

  private generateStaffName(role: StaffRole, level: StaffLevel): string {
    const firstNames = [
      'John',
      'Mike',
      'Carlos',
      'Hans',
      'Pierre',
      'Marco',
      'Yuki',
      'Ali',
      'David',
      'Luis',
    ];
    const lastNames = [
      'Smith',
      'Garcia',
      'Mueller',
      'Dubois',
      'Rossi',
      'Tanaka',
      'Santos',
      'Kim',
      'Jensen',
      'Obi',
    ];
    const prefix = {
      [StaffRole.HEAD_COACH]: 'Coach',
      [StaffRole.FITNESS_COACH]: 'Coach',
      [StaffRole.PSYCHOLOGY_COACH]: 'Dr.',
      [StaffRole.TECHNICAL_COACH]: 'Coach',
      [StaffRole.SET_PIECE_COACH]: 'Coach',
      [StaffRole.GOALKEEPER_COACH]: 'Coach',
      [StaffRole.TEAM_DOCTOR]: 'Dr.',
    }[role];
    const first = firstNames[Math.floor(Math.random() * firstNames.length)];
    const last = lastNames[Math.floor(Math.random() * lastNames.length)];
    return `${prefix} ${first} ${last}`;
  }
}
