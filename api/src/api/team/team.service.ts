import { OffsetPaginatedDto } from '@/common/dto/offset-pagination/paginated.dto';
import { Uuid } from '@/common/types/common.type';
import { ErrorCode } from '@/constants/error-code.constant';
import {
  getRandomNameByNationality,
  getRandomNationality,
} from '@/constants/name-database';
import { ValidationException } from '@/exceptions/validation.exception';
import { paginate } from '@/utils/offset-pagination';
import {
  BenchConfig,
  LeagueEntity,
  StaffEntity,
  StaffLevel,
  StaffRole,
  TeamEntity,
} from '@goalxi/database';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import assert from 'assert';
import { plainToInstance } from 'class-transformer';
import { Repository } from 'typeorm';
import { CreateTeamReqDto } from './dto/create-team.req.dto';
import { ListTeamReqDto } from './dto/list-team.req.dto';
import { TeamResDto } from './dto/team.res.dto';
import { UpdateTeamReqDto } from './dto/update-team.req.dto';

import { PlayerEntity } from '@goalxi/database';
import { PlayerService } from '../player/player.service';

@Injectable()
export class TeamService {
  constructor(
    private readonly playerService: PlayerService,
    @InjectRepository(StaffEntity)
    private readonly staffRepo: Repository<StaffEntity>,
  ) {}

  async findMany(
    reqDto: ListTeamReqDto,
  ): Promise<OffsetPaginatedDto<TeamResDto>> {
    const query = TeamEntity.createQueryBuilder('team').orderBy(
      'team.createdAt',
      'DESC',
    );
    const [teams, metaDto] = await paginate<TeamEntity>(query, reqDto, {
      skipCount: false,
      takeAll: false,
    });

    return new OffsetPaginatedDto(
      teams.map((team) => this.mapToResDto(team)),
      metaDto,
    );
  }

  async findOne(id: string): Promise<TeamResDto> {
    assert(id, 'id is required');

    // Generic UUID regex to prevent DB errors
    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(id)) {
      throw new ValidationException(ErrorCode.E002, 'Invalid ID format');
    }

    const team = await TeamEntity.findOneByOrFail({ id: id as Uuid });

    // Auto-generate players if team has none (e.g. for existing teams before this logic)
    const playersCount = await PlayerEntity.countBy({ teamId: team.id });
    if (playersCount === 0) {
      await this.playerService.generateRandom(18, team.id, team.nationality);
    }

    return this.mapToResDto(team);
  }

  async findByUserId(userId: Uuid): Promise<TeamResDto | null> {
    assert(userId, 'userId is required');
    const team = await TeamEntity.findOneBy({ userId });

    return team ? this.mapToResDto(team) : null;
  }

  async create(reqDto: CreateTeamReqDto): Promise<TeamResDto> {
    // Check if user already has a team (one-to-one relationship)
    const existingTeam = await TeamEntity.findOneBy({ userId: reqDto.userId });
    if (existingTeam) {
      throw new ValidationException(ErrorCode.E001, 'User already has a team');
    }

    const team = new TeamEntity({
      userId: reqDto.userId,
      name: reqDto.name,
      nationality: reqDto.nationality,
      leagueId: reqDto.leagueId || null,
      logoUrl: reqDto.logoUrl || '',
      jerseyColorPrimary: reqDto.jerseyColorPrimary || '#FF0000',
      jerseyColorSecondary: reqDto.jerseyColorSecondary || '#FFFFFF',
    });

    await team.save();

    // Initialize team with a starting squad of 18 players
    // Use team's nationality for player generation to create cohesive squads
    await this.playerService.generateRandom(18, team.id, team.nationality);

    // Create default Level 2 head coach
    const nationality = team.nationality || getRandomNationality();
    const { firstName, lastName } = getRandomNameByNationality(nationality);
    const headCoach = this.staffRepo.create({
      teamId: team.id,
      name: `${firstName} ${lastName}`,
      role: StaffRole.HEAD_COACH,
      level: StaffLevel.LEVEL_2,
      salary: 4000,
      contractExpiry: new Date(Date.now() + 16 * 7 * 24 * 60 * 60 * 1000),
      autoRenew: true,
      isActive: true,
      nationality,
    });
    await this.staffRepo.save(headCoach);

    // Create default Level 2 fitness coach
    const { firstName: fitFirst, lastName: fitLast } =
      getRandomNameByNationality(nationality);
    const fitnessCoach = this.staffRepo.create({
      teamId: team.id,
      name: `${fitFirst} ${fitLast}`,
      role: StaffRole.FITNESS_COACH,
      level: StaffLevel.LEVEL_2,
      salary: 2000,
      contractExpiry: new Date(Date.now() + 16 * 7 * 24 * 60 * 60 * 1000),
      autoRenew: true,
      isActive: true,
      nationality,
    });
    await this.staffRepo.save(fitnessCoach);

    return this.mapToResDto(team);
  }

  async update(id: Uuid, reqDto: UpdateTeamReqDto): Promise<TeamResDto> {
    assert(id, 'id is required');
    const team = await TeamEntity.findOneByOrFail({ id });

    if (reqDto.name) team.name = reqDto.name;
    if (reqDto.nationality !== undefined) team.nationality = reqDto.nationality;
    if (reqDto.leagueId !== undefined) team.leagueId = reqDto.leagueId || null;
    if (reqDto.logoUrl !== undefined) team.logoUrl = reqDto.logoUrl;
    if (reqDto.jerseyColorPrimary)
      team.jerseyColorPrimary = reqDto.jerseyColorPrimary;
    if (reqDto.jerseyColorSecondary)
      team.jerseyColorSecondary = reqDto.jerseyColorSecondary;

    await team.save();

    return this.mapToResDto(team);
  }

  async updateBenchConfig(
    id: Uuid,
    benchConfig: BenchConfig,
  ): Promise<TeamResDto> {
    assert(id, 'id is required');
    const team = await TeamEntity.findOneByOrFail({ id });

    team.benchConfig = benchConfig;
    await team.save();

    return this.mapToResDto(team);
  }

  async delete(id: Uuid): Promise<void> {
    assert(id, 'id is required');
    const team = await TeamEntity.findOneByOrFail({ id });
    await team.softRemove();
  }

  /**
   * List BOT teams available for takeover (only lowest tier leagues)
   */
  async listAvailableBotTeams(leagueId?: string): Promise<TeamResDto[]> {
    // Find the maximum tier (lowest league level)
    const maxTierResult = await LeagueEntity.createQueryBuilder('league')
      .select('MAX(league.tier)', 'maxTier')
      .getRawOne();
    const lowestTier = maxTierResult?.maxTier || 4;

    const query = TeamEntity.createQueryBuilder('team')
      .leftJoinAndSelect('team.league', 'league')
      .where('team.isBot = :isBot', { isBot: true })
      .andWhere('team.leagueId IS NOT NULL')
      .andWhere('league.tier = :lowestTier', { lowestTier });

    if (leagueId) {
      query.andWhere('team.leagueId = :leagueId', { leagueId });
    }

    const teams = await query.getMany();
    return teams.map((team) => this.mapToResDto(team));
  }

  /**
   * Apply to take over a BOT team (must be in lowest tier league)
   */
  async applyForTakeover(
    teamId: string,
    userId: Uuid,
  ): Promise<{ success: boolean; message: string }> {
    const team = await TeamEntity.findOneByOrFail({ id: teamId as Uuid });

    if (!team.isBot) {
      throw new ValidationException(ErrorCode.E001, 'Team is not a BOT team');
    }

    // Verify team is in the lowest tier league
    const maxTierResult = await LeagueEntity.createQueryBuilder('league')
      .select('MAX(league.tier)', 'maxTier')
      .getRawOne();
    const lowestTier = maxTierResult?.maxTier || 4;

    const league = await LeagueEntity.findOneByOrFail({
      id: team.leagueId as Uuid,
    });
    if (league.tier !== lowestTier) {
      throw new ValidationException(
        ErrorCode.E001,
        'Only BOT teams in the lowest tier league can be taken over',
      );
    }

    // Check if user already has a team
    const existingTeam = await TeamEntity.findOneBy({ userId });
    if (existingTeam) {
      throw new ValidationException(ErrorCode.E001, 'User already has a team');
    }

    // For now, auto-approve (manager takes over BOT team directly)
    // In the future, this could be an application/approval process
    team.userId = userId;
    team.isBot = false;
    await team.save();

    return {
      success: true,
      message: `Successfully took over team ${team.name}`,
    };
  }

  private mapToResDto(team: TeamEntity): TeamResDto {
    return plainToInstance(TeamResDto, {
      id: team.id,
      userId: team.userId,
      leagueId: team.leagueId,
      name: team.name,
      nationality: team.nationality,
      logoUrl: team.logoUrl,
      jerseyColorPrimary: team.jerseyColorPrimary,
      jerseyColorSecondary: team.jerseyColorSecondary,
      createdAt: team.createdAt,
      updatedAt: team.updatedAt,
    });
  }
}
