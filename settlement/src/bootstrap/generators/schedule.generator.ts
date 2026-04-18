import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  MatchEntity,
  MatchStatus,
  MatchType,
  LeagueEntity,
  TeamEntity,
} from '@goalxi/database';

@Injectable()
export class ScheduleGenerator {
  private readonly logger = new Logger(ScheduleGenerator.name);

  constructor(
    @InjectRepository(MatchEntity)
    private matchRepo: Repository<MatchEntity>,
    @InjectRepository(LeagueEntity)
    private leagueRepo: Repository<LeagueEntity>,
    @InjectRepository(TeamEntity)
    private teamRepo: Repository<TeamEntity>,
  ) {}

  async generateSeason1Schedule(): Promise<void> {
    const count = await this.matchRepo.count();
    if (count > 0) {
      this.logger.log(
        `[ScheduleGenerator] ${count} matches already exist, skipping`,
      );
      return;
    }

    this.logger.log('[ScheduleGenerator] Generating Season 1 schedule...');

    const leagues = await this.leagueRepo.find();
    let totalMatches = 0;

    for (const league of leagues) {
      const teams = await this.teamRepo.find({
        where: { leagueId: league.id },
      });
      const teamIds = teams.map((t) => t.id);

      if (teamIds.length < 4) {
        this.logger.warn(
          `[ScheduleGenerator] League ${league.name} has only ${teamIds.length} teams, skipping`,
        );
        continue;
      }

      const matches = this.generateRoundRobin(teamIds, league.id);
      await this.matchRepo.save(matches);
      totalMatches += matches.length;
    }

    this.logger.log(
      `[ScheduleGenerator] Generated ${totalMatches} matches for Season 1`,
    );
  }

  private generateRoundRobin(
    teamIds: string[],
    leagueId: string,
  ): Partial<MatchEntity>[] {
    const matches: Partial<MatchEntity>[] = [];
    const numRounds = teamIds.length - 1;

    const fixedTeam = teamIds[0];
    const rotatingTeams = teamIds.slice(1);

    // First round-robin (home)
    for (let round = 0; round < numRounds; round++) {
      const matchups = this.generateRoundMatchups(
        fixedTeam,
        this.rotateTeams(rotatingTeams, round),
      );

      for (const { home, away } of matchups) {
        matches.push({
          leagueId,
          homeTeamId: home,
          awayTeamId: away,
          season: 1,
          week: round + 1,
          status: MatchStatus.SCHEDULED,
          type: MatchType.LEAGUE,
          tacticsLocked: false,
          homeForfeit: false,
          awayForfeit: false,
        });
      }
    }

    // Second round-robin (away - home/away swapped)
    for (let round = 0; round < numRounds; round++) {
      const matchups = this.generateRoundMatchups(
        fixedTeam,
        this.rotateTeams(rotatingTeams, round),
      );

      for (const { home, away } of matchups) {
        matches.push({
          leagueId,
          homeTeamId: away,
          awayTeamId: home,
          season: 1,
          week: numRounds + round + 1,
          status: MatchStatus.SCHEDULED,
          type: MatchType.LEAGUE,
          tacticsLocked: false,
          homeForfeit: false,
          awayForfeit: false,
        });
      }
    }

    return matches;
  }

  private generateRoundMatchups(
    fixedTeam: string,
    rotatingTeams: string[],
  ): Array<{ home: string; away: string }> {
    const matchups: Array<{ home: string; away: string }> = [];
    matchups.push({ home: fixedTeam, away: rotatingTeams[0] });

    for (let i = 1; i < rotatingTeams.length / 2; i++) {
      matchups.push({
        home: rotatingTeams[rotatingTeams.length - i],
        away: rotatingTeams[i],
      });
    }

    return matchups;
  }

  private rotateTeams(teams: string[], round: number): string[] {
    const rotated = [...teams];
    const last = rotated.pop()!;
    rotated.unshift(last);
    return rotated;
  }
}
