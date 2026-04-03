import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  LeagueEntity,
  LeagueStandingEntity,
  TeamEntity,
  SeasonResultEntity,
} from '@goalxi/database';

export interface RelegationResult {
  promoted: TeamEntity[];
  relegated: TeamEntity[];
  playoffMatches: PlayoffMatch[];
}

export interface PlayoffMatch {
  upperTeam: TeamEntity;
  lowerTeam: TeamEntity;
  upperLeague: LeagueEntity;
  lowerLeague: LeagueEntity;
}

@Injectable()
export class PromotionRelegationService {
  private readonly logger = new Logger(PromotionRelegationService.name);

  constructor(
    @InjectRepository(LeagueEntity)
    private readonly leagueRepository: Repository<LeagueEntity>,
    @InjectRepository(LeagueStandingEntity)
    private readonly standingRepository: Repository<LeagueStandingEntity>,
    @InjectRepository(TeamEntity)
    private readonly teamRepository: Repository<TeamEntity>,
    @InjectRepository(SeasonResultEntity)
    private readonly seasonResultRepository: Repository<SeasonResultEntity>,
  ) {}

  async processSeasonEnd(
    leagueId: string,
    season: number,
  ): Promise<RelegationResult> {
    const league = await this.leagueRepository.findOne({
      where: { id: leagueId as any },
    });
    if (!league) {
      throw new Error(`League ${leagueId} not found`);
    }

    this.logger.log(
      `Processing promotion/relegation for league ${league.name} (Tier ${league.tier})`,
    );

    const standings = await this.standingRepository.find({
      where: { leagueId, season },
      relations: ['team'],
      order: { position: 'ASC' },
    });

    if (standings.length === 0) {
      throw new Error(
        `No standings found for league ${leagueId} season ${season}`,
      );
    }

    const result: RelegationResult = {
      promoted: [],
      relegated: [],
      playoffMatches: [],
    };

    const promotedCount = league.promotionSlots;
    for (let i = 0; i < promotedCount && i < standings.length; i++) {
      const standing = standings[i];
      if (
        standing &&
        standing.position >= 1 &&
        standing.position <= promotedCount
      ) {
        const team = await this.teamRepository.findOne({
          where: { id: standing.teamId as any },
        });
        if (team) {
          result.promoted.push(team);
          await this.saveSeasonResult(
            team,
            league,
            season,
            standing.position,
            true,
            false,
          );
          this.logger.log(
            `   ↑ ${team.name} promoted (position ${standing.position})`,
          );
        }
      }
    }

    for (const team of result.promoted) {
      const upperLeague = await this.getUpperLeague(league);
      if (upperLeague) {
        await this.updateTeamLeagueAndStanding(team.id, upperLeague.id, season);
      }
    }

    const relegationStart = league.maxTeams - league.relegationSlots + 1;
    const relegationCount = league.relegationSlots;
    for (let i = 0; i < standings.length; i++) {
      const standing = standings[i];
      if (standing && standing.position >= relegationStart) {
        const team = await this.teamRepository.findOne({
          where: { id: standing.teamId as any },
        });
        if (team) {
          result.relegated.push(team);
          await this.saveSeasonResult(
            team,
            league,
            season,
            standing.position,
            false,
            true,
          );
          this.logger.log(
            `   ↓ ${team.name} relegated (position ${standing.position})`,
          );
        }
      }
    }

    for (const team of result.relegated) {
      const lowerLeague = await this.getLowerLeague(league);
      if (lowerLeague) {
        await this.updateTeamLeagueAndStanding(team.id, lowerLeague.id, season);
      }
    }

    this.logger.log(
      `Promotion/Relegation complete for ${league.name}: ` +
        `${result.promoted.length} promoted, ${result.relegated.length} relegated`,
    );

    return result;
  }

  private async getUpperLeague(
    league: LeagueEntity,
  ): Promise<LeagueEntity | null> {
    if (league.tier <= 1) return null;
    return this.leagueRepository.findOne({
      where: { tier: league.tier - 1, tierDivision: league.tierDivision },
    });
  }

  private async getLowerLeague(
    league: LeagueEntity,
  ): Promise<LeagueEntity | null> {
    return this.leagueRepository.findOne({
      where: { tier: league.tier + 1, tierDivision: league.tierDivision },
    });
  }

  private async updateTeamLeagueAndStanding(
    teamId: string,
    newLeagueId: string,
    season: number,
  ): Promise<void> {
    const team = await this.teamRepository.findOne({
      where: { id: teamId as any },
    });
    if (team) {
      team.leagueId = newLeagueId;
      await this.teamRepository.save(team);
    }

    const standing = await this.standingRepository.findOne({
      where: { teamId: teamId as any, season },
    });
    if (standing) {
      standing.leagueId = newLeagueId;
      await this.standingRepository.save(standing);
    }
  }

  private async saveSeasonResult(
    team: TeamEntity,
    league: LeagueEntity,
    season: number,
    finalPosition: number,
    promoted: boolean,
    relegated: boolean,
  ): Promise<void> {
    const existing = await this.seasonResultRepository.findOne({
      where: { teamId: team.id, season },
    });

    if (existing) {
      existing.finalPosition = finalPosition;
      existing.promoted = promoted;
      existing.relegated = relegated;
      await this.seasonResultRepository.save(existing);
    } else {
      const result = this.seasonResultRepository.create({
        teamId: team.id,
        leagueId: league.id,
        season,
        finalPosition,
        promoted,
        relegated,
      });
      await this.seasonResultRepository.save(result);
    }
  }
}
