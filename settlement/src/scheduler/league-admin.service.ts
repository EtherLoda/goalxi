import {
  Injectable,
  Logger,
  BadRequestException,
  Inject,
} from '@nestjs/common';
import { LOGGER_SERVICE, PinoLoggerService } from '@goalxi/logger';
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
  constructor(
    @Inject(LOGGER_SERVICE)
    private readonly logger: PinoLoggerService,
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

    this.logger.info(
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

    // From here on this is a 3-write sequence whose intermediate states
    // are all invalid, so it runs in ONE transaction.
    //
    // Failure after `team.leagueId = leagueId` but before the standing
    // row exists leaves a team pointing at a league with no ladder
    // entry. That is worse than a hard error: `promotion-relegation`
    // and `playoff` both select by `standing.position === N`, so the
    // phantom team is invisible to every selection query while still
    // sitting in the table — and `league.maxTeams` is then permanently
    // off by one, because `count(standing)` never sees it.
    //
    // NOTE: this service currently has no production callers (only its
    // own spec and its DI registration), so the exposure is theoretical
    // today. Wrapping it anyway keeps the invariant true if it is ever
    // wired up.
    await this.dataSource.transaction(async (manager) => {
      const teamRepo = manager.getRepository(TeamEntity);
      team.leagueId = leagueId;
      await teamRepo.save(team);

      const standing = manager.getRepository(LeagueStandingEntity).create({
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
      });
      await manager.getRepository(LeagueStandingEntity).save(standing);

      const youthLeague = await manager
        .getRepository(YouthLeagueEntity)
        .findOne({ where: { parentTier: league.tier } });

      if (youthLeague) {
        const youthTeam = manager.getRepository(YouthTeamEntity).create({
          teamId: team.id,
          youthLeagueId: youthLeague.id,
          name: `${team.name} Youth`,
        });
        await manager.getRepository(YouthTeamEntity).save(youthTeam);
        this.logger.info(`Created youth team for ${team.name}`);
      }
    });

    this.logger.info(
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

    // Clear the team FIRST, then drop the standing row, in one
    // transaction.
    //
    // The original order was inverted: it deleted the standing row and
    // only then cleared `team.leagueId`. A failure in between left a
    // team with no `leagueId` still occupying a slot in the old
    // league's `count(standing)` — so `addTeamToLeague`'s capacity check
    // would refuse a replacement while the ladder had a hole in it.
    await this.dataSource.transaction(async (manager) => {
      team.leagueId = null;
      await manager.getRepository(TeamEntity).save(team);

      await manager
        .getRepository(LeagueStandingEntity)
        .delete({ teamId: teamId as any });
    });

    this.logger.info(`Removed team ${team.name} from league`);
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
