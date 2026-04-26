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
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CurrentUser } from '../../decorators/current-user.decorator';
import { AuthGuard } from '../../guards/auth.guard';
import { getSigningFee, STAFF_SALARY, StaffsService } from './staffs.service';

@Controller({ path: 'staffs', version: '1' })
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
      signingFeesByLevel: {
        [StaffLevel.LEVEL_1]: getSigningFee(StaffLevel.LEVEL_1),
        [StaffLevel.LEVEL_2]: getSigningFee(StaffLevel.LEVEL_2),
        [StaffLevel.LEVEL_3]: getSigningFee(StaffLevel.LEVEL_3),
        [StaffLevel.LEVEL_4]: getSigningFee(StaffLevel.LEVEL_4),
        [StaffLevel.LEVEL_5]: getSigningFee(StaffLevel.LEVEL_5),
      },
      salaryByLevel: STAFF_SALARY,
    };
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
      body.trainedSkill,
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

  /** Assign a player to a coach */
  @Post(':coachId/assign')
  async assignPlayer(
    @Param('coachId') coachId: string,
    @Body() body: AssignPlayerDto,
  ): Promise<AssignmentDto> {
    const assignment = await this.staffsService.assignPlayer(
      coachId,
      body.playerId,
    );
    return mapAssignmentToDto(assignment);
  }

  /** Unassign a player from a coach */
  @Post(':coachId/unassign')
  async unassignPlayer(
    @Param('coachId') coachId: string,
    @Body() body: UnassignPlayerDto,
  ): Promise<{ success: boolean }> {
    await this.staffsService.unassignPlayer(coachId, body.playerId);
    return { success: true };
  }

  /** Get assignments for a coach */
  @Get(':coachId/assignments')
  async getCoachAssignments(
    @Param('coachId') coachId: string,
  ): Promise<AssignmentDto[]> {
    const assignments = await this.staffsService.getAssignmentsByCoach(coachId);
    return assignments.map(mapAssignmentToDto);
  }

  /** Get assignments for a player */
  @Get('player/:playerId/assignments')
  async getPlayerAssignments(
    @Param('playerId') playerId: string,
  ): Promise<AssignmentDto[]> {
    const assignments =
      await this.staffsService.getAssignmentsByPlayer(playerId);
    return assignments.map(mapAssignmentToDto);
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

  /** Update a coach's trained skill */
  @Patch(':id/trained-skill')
  async updateTrainedSkill(
    @Param('id') id: string,
    @Body() body: UpdateTrainedSkillDto,
  ): Promise<StaffDto> {
    const staff = await this.staffsService.updateTrainedSkill(
      id,
      body.trainedSkill,
    );
    return mapStaffToDto(staff);
  }
}

// --- DTOs & Mappers ---

export interface HireStaffDto {
  role: StaffRole;
  level: StaffLevel;
  trainedSkill?: string;
}

export interface SetAutoRenewDto {
  autoRenew: boolean;
}

export interface UpdateTrainedSkillDto {
  trainedSkill: string | null;
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
  trainedSkill?: string;
}

export interface CostSummaryDto {
  staffCount: number;
  weeklySalary: number;
  signingFeesByLevel: Record<StaffLevel, number>;
  salaryByLevel: Record<number, number>;
}

export interface AssignPlayerDto {
  playerId: string;
}

export interface UnassignPlayerDto {
  playerId: string;
}

export interface AssignmentDto {
  id: string;
  coachId: string;
  playerId: string;
  playerName?: string;
  trainingCategory: string;
  assignedAt: string;
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
    trainedSkill: s.trainedSkill,
  };
}

function mapAssignmentToDto(a: any): AssignmentDto {
  return {
    id: a.id,
    coachId: a.coachId,
    playerId: a.playerId,
    playerName: a.player?.name,
    trainingCategory: a.trainingCategory,
    assignedAt: a.assignedAt?.toISOString(),
  };
}
