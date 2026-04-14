import {
  FinanceEntity,
  StaffEntity,
  StaffLevel,
  StaffRole,
  TeamEntity,
  Uuid,
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

export const STAFF_HIRE_COST: Record<StaffLevel, number> = {
  [StaffLevel.LEVEL_1]: 5000,
  [StaffLevel.LEVEL_2]: 20000,
  [StaffLevel.LEVEL_3]: 80000,
  [StaffLevel.LEVEL_4]: 320000,
  [StaffLevel.LEVEL_5]: 1280000,
};

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
    const hireCost = STAFF_HIRE_COST[level];
    const team = await this.teamRepo.findOne({ where: { id: teamId as Uuid } });
    if (!team) throw new NotFoundException('Team not found');

    const finance = await this.financeRepo.findOne({
      where: { teamId: teamId as Uuid },
    });
    if (!finance || finance.balance < hireCost) {
      throw new BadRequestException('Insufficient funds');
    }

    // Deduct hire cost
    finance.balance -= hireCost;
    await this.financeRepo.save(finance);

    // Create staff
    const seasonWeeks = 16;
    const contractExpiry = new Date();
    contractExpiry.setDate(contractExpiry.getDate() + seasonWeeks * 7);

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
        // Renew for another season
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
