import {
  CoachPlayerAssignmentEntity,
  FinanceEntity,
  PlayerEntity,
  StaffEntity,
  StaffLevel,
  StaffRole,
  TeamEntity,
  Uuid,
  getMaxPlayersForRole,
  getTrainingCategoryForRole,
} from '@goalxi/database';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThanOrEqual, Repository } from 'typeorm';

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
export class StaffsService {
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
  ) {}

  /** Get all staff for a team */
  async findByTeam(teamId: string): Promise<StaffEntity[]> {
    return this.staffRepo.find({
      where: { teamId, isActive: true },
      order: { role: 'ASC' },
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
  ): Promise<StaffEntity> {
    // Check if role already filled
    const existing = await this.staffRepo.findOne({
      where: { teamId, role, isActive: true },
    });
    if (existing) {
      throw new BadRequestException(`Team already has an active ${role}`);
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

    // Deduct signing fee
    finance.balance -= signingFee;
    await this.financeRepo.save(finance);

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
    });

    await this.staffRepo.save(staff);
    return staff;
  }

  /** Fire a staff member - pay termination fee */
  async fire(staffId: string, userId: string): Promise<void> {
    const staff = await this.findOne(staffId);
    if (!staff.isActive)
      throw new BadRequestException('Staff already inactive');

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

    // Deduct and deactivate
    finance.balance -= terminationFee;
    await this.financeRepo.save(finance);

    staff.isActive = false;
    await this.staffRepo.save(staff);
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

  /** Assign a player to a coach */
  async assignPlayer(
    coachId: string,
    playerId: string,
  ): Promise<CoachPlayerAssignmentEntity> {
    const coach = await this.findOne(coachId);
    if (!coach.isActive) {
      throw new BadRequestException('Cannot assign player to inactive coach');
    }

    const player = await this.playerRepo.findOne({
      where: { id: playerId as Uuid },
    });
    if (!player) {
      throw new NotFoundException('Player not found');
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

    // Check training category conflict - player can only have one coach per category
    const trainingCategory = getTrainingCategoryForRole(coach.role);
    const conflictingAssignment = await this.assignmentRepo.findOne({
      where: { playerId, trainingCategory },
    });
    if (conflictingAssignment) {
      throw new BadRequestException(
        'Player already has a coach for this training category',
      );
    }

    const assignment = this.assignmentRepo.create({
      coachId,
      playerId,
      trainingCategory,
    });
    return this.assignmentRepo.save(assignment);
  }

  /** Unassign a player from a coach */
  async unassignPlayer(coachId: string, playerId: string): Promise<void> {
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
    playerId: string,
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
