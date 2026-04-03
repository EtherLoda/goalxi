import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import {
  LeagueEntity,
  LeagueStandingEntity,
  TeamEntity,
  YouthLeagueEntity,
  YouthTeamEntity,
  MatchEntity,
} from '@goalxi/database';

@Injectable()
export class LeagueAdminService {
  private readonly logger = new Logger(LeagueAdminService.name);

  constructor(
    @InjectRepository(LeagueEntity)
    private readonly leagueRepository: Repository<LeagueEntity>,
    @InjectRepository(LeagueStandingEntity)
    private readonly standingRepository: Repository<LeagueStandingEntity>,
    @InjectRepository(TeamEntity)
    private readonly teamRepository: Repository<TeamEntity>,
    @InjectRepository(YouthLeagueEntity)
    private readonly youthLeagueRepository: Repository<YouthLeagueEntity>,
    @InjectRepository(YouthTeamEntity)
    private readonly youthTeamRepository: Repository<YouthTeamEntity>,
    private readonly dataSource: DataSource,
  ) {}

  async createLeague(
    name: string,
    tier: number,
    tierDivision: number,
  ): Promise<LeagueEntity> {
    const existing = await this.leagueRepository.findOne({ where: { name } });
    if (existing) {
      throw new BadRequestException(`League "${name}" already exists`);
    }

    const league = this.leagueRepository.create({
      name,
      tier,
      tierDivision,
      maxTeams: 16,
      promotionSlots: 1,
      playoffSlots: 4,
      relegationSlots: 4,
      status: 'active',
    });

    await this.leagueRepository.save(league);

    const youthLeagueName = `${name} Youth League`;
    const youthLeague = this.youthLeagueRepository.create({
      name: youthLeagueName,
      parentTier: tier,
      maxTeams: 16,
      status: 'active',
    });
    await this.youthLeagueRepository.save(youthLeague);

    this.logger.log(
      `Created league: ${name} (Tier ${tier}, Division ${tierDivision}) and youth league: ${youthLeagueName}`,
    );
    return league;
  }

  async addTeamToLeague(
    teamId: string,
    leagueId: string,
    season: number = 1,
  ): Promise<void> {
    const team = await this.teamRepository.findOne({
      where: { id: teamId as any },
    });
    if (!team) {
      throw new BadRequestException(`Team ${teamId} not found`);
    }

    const league = await this.leagueRepository.findOne({
      where: { id: leagueId as any },
    });
    if (!league) {
      throw new BadRequestException(`League ${leagueId} not found`);
    }

    const currentTeams = await this.standingRepository.count({
      where: { leagueId },
    });
    if (currentTeams >= league.maxTeams) {
      throw new BadRequestException(
        `League ${league.name} is full (${league.maxTeams} teams)`,
      );
    }

    const existingStanding = await this.standingRepository.findOne({
      where: { teamId, leagueId, season },
    });
    if (existingStanding) {
      throw new BadRequestException(
        `Team ${team.name} already in league ${league.name}`,
      );
    }

    team.leagueId = leagueId;
    await this.teamRepository.save(team);

    const standing = this.standingRepository.create({
      teamId,
      leagueId,
      season,
      position: currentTeams + 1,
      played: 0,
      points: 0,
      wins: 0,
      draws: 0,
      losses: 0,
      goalsFor: 0,
      goalsAgainst: 0,
      goalDifference: 0,
      recentForm: '',
    });
    await this.standingRepository.save(standing);

    const youthLeague = await this.youthLeagueRepository.findOne({
      where: { parentTier: league.tier },
    });
    if (youthLeague) {
      const youthTeam = this.youthTeamRepository.create({
        teamId: team.id,
        youthLeagueId: youthLeague.id,
        name: `${team.name} Youth`,
      });
      await this.youthTeamRepository.save(youthTeam);
      this.logger.log(`Created youth team for ${team.name}`);
    }

    this.logger.log(
      `Added team ${team.name} to league ${league.name} (season ${season})`,
    );
  }

  async removeTeamFromLeague(teamId: string): Promise<void> {
    const team = await this.teamRepository.findOne({
      where: { id: teamId as any },
    });
    if (!team) {
      throw new BadRequestException(`Team ${teamId} not found`);
    }

    await this.standingRepository.delete({ teamId: teamId as any });

    team.leagueId = null;
    await this.teamRepository.save(team);

    this.logger.log(`Removed team ${team.name} from league`);
  }

  async getAvailableSlots(leagueId: string): Promise<number> {
    const league = await this.leagueRepository.findOne({
      where: { id: leagueId as any },
    });
    if (!league) return 0;

    const currentTeams = await this.standingRepository.count({
      where: { leagueId },
    });
    return Math.max(0, league.maxTeams - currentTeams);
  }

  async getLeagueSeasonInfo(
    leagueId: string,
    season: number,
  ): Promise<{
    totalMatches: number;
    completedMatches: number;
    currentWeek: number;
    isComplete: boolean;
  }> {
    const league = await this.leagueRepository.findOne({
      where: { id: leagueId as any },
    });
    if (!league) {
      throw new BadRequestException(`League ${leagueId} not found`);
    }

    const matchRepo = this.dataSource.getRepository(MatchEntity);
    const totalMatches = await matchRepo.count({ where: { leagueId, season } });
    const completedMatches = await matchRepo.count({
      where: { leagueId, season, status: 'completed' as any },
    });

    const latestMatch = await matchRepo.findOne({
      where: { leagueId, season },
      order: { week: 'DESC' },
    });

    return {
      totalMatches,
      completedMatches,
      currentWeek: latestMatch?.week ?? 0,
      isComplete: completedMatches >= totalMatches && totalMatches > 0,
    };
  }
}
