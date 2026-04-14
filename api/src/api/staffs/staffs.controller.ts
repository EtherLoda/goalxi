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
  Body,
  Controller,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CurrentUser } from '../../decorators/current-user.decorator';
import { AuthGuard } from '../../guards/auth.guard';
import { STAFF_HIRE_COST, STAFF_SALARY, StaffsService } from './staffs.service';

@Controller('staffs')
@UseGuards(AuthGuard)
export class StaffsController {
  constructor(
    private readonly staffsService: StaffsService,
    @InjectRepository(TeamEntity)
    private teamRepo: Repository<TeamEntity>,
    @InjectRepository(FinanceEntity)
    private financeRepo: Repository<FinanceEntity>,
  ) {}

  /** List staff for current team */
  @Get()
  async list(@CurrentUser('id') userId: Uuid): Promise<StaffDto[]> {
    const team = await this.teamRepo.findOneBy({ userId });
    if (!team) return [];
    const staffs = await this.staffsService.findByTeam(team.id);
    return staffs.map(mapStaffToDto);
  }

  /** Get single staff */
  @Get(':id')
  async getOne(@Param('id') id: string): Promise<StaffDto> {
    const staff = await this.staffsService.findOne(id);
    return mapStaffToDto(staff);
  }

  /** Hire a new staff member */
  @Post('hire')
  async hire(
    @CurrentUser('id') userId: Uuid,
    @Body() body: HireStaffDto,
  ): Promise<StaffDto> {
    const team = await this.teamRepo.findOneBy({ userId });
    if (!team) throw new BadRequestException('Team not found');

    const staff = await this.staffsService.hire(
      team.id,
      body.role,
      body.level,
      userId,
    );
    return mapStaffToDto(staff);
  }

  /** Fire a staff member */
  @Post(':id/fire')
  async fire(
    @Param('id') id: string,
    @CurrentUser('id') userId: Uuid,
  ): Promise<{ success: boolean }> {
    await this.staffsService.fire(id, userId);
    return { success: true };
  }

  /** Toggle auto-renewal */
  @Post(':id/auto-renew')
  async setAutoRenew(
    @Param('id') id: string,
    @Body() body: SetAutoRenewDto,
  ): Promise<StaffDto> {
    const staff = await this.staffsService.setAutoRenew(id, body.autoRenew);
    return mapStaffToDto(staff);
  }

  /** Get staff cost summary */
  @Get('cost-summary')
  async getCostSummary(
    @CurrentUser('id') userId: Uuid,
  ): Promise<CostSummaryDto> {
    const team = await this.teamRepo.findOneBy({ userId });
    if (!team) throw new BadRequestException('Team not found');

    const staffs = await this.staffsService.findByTeam(team.id);
    const weeklySalary = staffs.reduce(
      (sum, s) => sum + STAFF_SALARY[s.level],
      0,
    );

    return {
      staffCount: staffs.length,
      weeklySalary,
      hireCosts: Object.values(STAFF_HIRE_COST),
      salaryByLevel: STAFF_SALARY,
    };
  }
}

// --- DTOs & Mappers ---

export interface HireStaffDto {
  role: StaffRole;
  level: StaffLevel;
}

export interface SetAutoRenewDto {
  autoRenew: boolean;
}

export interface StaffDto {
  id: string;
  name: string;
  role: string;
  level: number;
  salary: number;
  contractExpiry: string;
  autoRenew: boolean;
  isActive: boolean;
  nationality?: string;
}

export interface CostSummaryDto {
  staffCount: number;
  weeklySalary: number;
  hireCosts: number[];
  salaryByLevel: Record<number, number>;
}

function mapStaffToDto(s: StaffEntity): StaffDto {
  return {
    id: s.id,
    name: s.name,
    role: s.role,
    level: s.level,
    salary: s.salary,
    contractExpiry: s.contractExpiry.toISOString(),
    autoRenew: s.autoRenew,
    isActive: s.isActive,
    nationality: s.nationality,
  };
}
