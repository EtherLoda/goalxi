import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { GAME_SETTINGS } from '@goalxi/database';
import { MatchEntity, MatchStatus, MatchType } from '@goalxi/database';

@Injectable()
export class SeasonSchedulerService {
  private readonly logger = new Logger(SeasonSchedulerService.name);

  private readonly MATCH_DAYS = [3, 6]; // 周三、周六
  private readonly MATCH_HOUR = 13;
  private readonly MATCH_MINUTE = 0;

  private readonly LEAGUE_WEEKS = 15;
  private readonly PLAYOFF_WEEK = 16;

  constructor(
    @InjectRepository(MatchEntity)
    private readonly matchRepository: Repository<MatchEntity>,
  ) {}

  /**
   * 生成指定联赛的赛季赛程
   */
  async generateSeasonSchedule(
    leagueId: string,
    teamIds: string[],
    season: number,
    startDate: Date,
  ): Promise<MatchEntity[]> {
    if (teamIds.length % 2 !== 0) {
      throw new Error('Number of teams must be even');
    }

    if (teamIds.length < 4) {
      throw new Error('League must have at least 4 teams');
    }

    this.logger.log(
      `Generating season ${season} schedule for league ${leagueId} with ${teamIds.length} teams`,
    );

    const numRounds = teamIds.length - 1;
    const leagueWeeks = numRounds;

    const matchDates = this.calculateMatchDates(startDate, leagueWeeks);

    const matches = this.generateDoubleRoundRobin(
      teamIds,
      leagueId,
      season,
      matchDates,
    );

    const savedMatches = await this.matchRepository.save(matches);

    this.logger.log(
      `Generated ${savedMatches.length} matches for league ${leagueId} season ${season}`,
    );

    return savedMatches;
  }

  /**
   * 为新赛季生成所有联赛的赛程
   * @param currentSeason 当前赛季
   * @returns 新赛季所有联赛的赛程
   */
  async generateNextSeasonSchedule(
    currentSeason: number,
  ): Promise<MatchEntity[]> {
    const nextSeason = currentSeason + 1;

    // 获取所有联赛及其球队
    const leagues = await this.matchRepository.manager
      .createQueryBuilder(MatchEntity, 'match')
      .select('DISTINCT match.leagueId', 'leagueId')
      .innerJoin('match.league', 'league')
      .getRawMany();

    // 计算新赛季开始日期（当前赛季Week 16结束后）
    const startDate = this.calculateNextSeasonStartDate();

    const allMatches: MatchEntity[] = [];

    for (const { leagueId } of leagues) {
      // 获取该联赛的16支球队
      const league = await this.matchRepository.manager
        .createQueryBuilder(MatchEntity, 'match')
        .innerJoinAndSelect('match.league', 'league')
        .where('match.leagueId = :leagueId', { leagueId })
        .getOne();

      if (!league?.league) continue;

      // 获取联赛所有球队（从新赛季 standings 获取，此时升降级已完成）
      const standings = await this.matchRepository.manager
        .createQueryBuilder(MatchEntity, 'match')
        .select('standing.team_id', 'teamId')
        .from('league_standing', 'standing')
        .where('standing.league_id = :leagueId', { leagueId })
        .andWhere('standing.season = :season', { season: nextSeason })
        .getRawMany();

      const teamIds = standings.map((s) => s.teamId);

      if (teamIds.length === 16) {
        const matches = await this.generateSeasonSchedule(
          leagueId,
          teamIds,
          nextSeason,
          startDate,
        );
        allMatches.push(...matches);
      }
    }

    this.logger.log(
      `Generated ${allMatches.length} matches for Season ${nextSeason}`,
    );

    return allMatches;
  }

  /**
   * 计算新赛季开始日期
   * 当前赛季 Week 16 结束后（周三附加赛后）的下一个周三
   */
  private calculateNextSeasonStartDate(): Date {
    const now = new Date();
    const dayOfWeek = now.getDay();

    // 找到下一个周三
    let daysUntilWednesday = (3 - dayOfWeek + 7) % 7;
    if (daysUntilWednesday === 0) {
      daysUntilWednesday = 7; // 如果今天是周三，则找下周三
    }

    const nextSeasonStart = new Date(now);
    nextSeasonStart.setDate(now.getDate() + daysUntilWednesday + 7); // Week 16 结束后
    nextSeasonStart.setHours(this.MATCH_HOUR, this.MATCH_MINUTE, 0, 0);

    return nextSeasonStart;
  }

  private calculateMatchDates(startDate: Date, weeks: number): Date[] {
    const dates: Date[] = [];
    const currentDate = new Date(startDate);

    // 找到第一个周三
    while (currentDate.getDay() !== 3) {
      currentDate.setDate(currentDate.getDate() + 1);
    }

    for (let week = 0; week < weeks; week++) {
      for (const matchDay of this.MATCH_DAYS) {
        const matchDate = new Date(currentDate);
        while (matchDate.getDay() !== matchDay) {
          matchDate.setDate(matchDate.getDate() + 1);
        }
        matchDate.setHours(this.MATCH_HOUR, this.MATCH_MINUTE, 0, 0);
        dates.push(matchDate);
      }
      currentDate.setDate(currentDate.getDate() + 7);
    }

    return dates;
  }

  private generateDoubleRoundRobin(
    teamIds: string[],
    leagueId: string,
    season: number,
    matchDates: Date[],
  ): Partial<MatchEntity>[] {
    const matches: Partial<MatchEntity>[] = [];
    const numRounds = teamIds.length - 1;

    const fixedTeam = teamIds[0];
    const rotatingTeams = teamIds.slice(1);

    for (let round = 0; round < numRounds; round++) {
      const roundMatchups = this.generateRoundMatchups(
        fixedTeam,
        this.rotateTeams(rotatingTeams, round),
      );

      const roundMatchDateIndices = [round * 2, round * 2 + 1];
      const roundMatchDates = roundMatchDateIndices
        .map((idx) => matchDates[idx])
        .filter(Boolean);

      if (roundMatchDates.length === 0) {
        continue;
      }

      for (let i = 0; i < roundMatchups.length; i++) {
        const { home, away } = roundMatchups[i];
        matches.push({
          leagueId,
          homeTeamId: home,
          awayTeamId: away,
          season,
          week: round + 1,
          scheduledAt: roundMatchDates[i % roundMatchDates.length],
          status: MatchStatus.SCHEDULED,
          type: MatchType.LEAGUE,
          tacticsLocked: false,
          homeForfeit: false,
          awayForfeit: false,
        });
      }
    }

    // 第二循环（主场客场对调）
    for (let round = 0; round < numRounds; round++) {
      const roundMatchups = this.generateRoundMatchups(
        fixedTeam,
        this.rotateTeams(rotatingTeams, round),
      );

      const roundMatchDateIndices = [round * 2, round * 2 + 1];
      const roundMatchDates = roundMatchDateIndices
        .map((idx) => matchDates[idx])
        .filter(Boolean);

      if (roundMatchDates.length === 0) {
        continue;
      }

      for (let i = 0; i < roundMatchups.length; i++) {
        const { home, away } = roundMatchups[i];
        matches.push({
          leagueId,
          homeTeamId: away,
          awayTeamId: home,
          season,
          week: numRounds + round + 1,
          scheduledAt: roundMatchDates[i % roundMatchDates.length],
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

    matchups.push({
      home: fixedTeam,
      away: rotatingTeams[0],
    });

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

  @Cron('0 0 * * 0') // 每周日检查
  async checkAndGenerateUpcomingMatches() {
    this.logger.debug('[SeasonScheduler] Checking for upcoming matches...');
  }

  async getCurrentSeasonWeek(leagueId: string): Promise<number> {
    const latestMatch = await this.matchRepository.findOne({
      where: { leagueId },
      order: { week: 'DESC' },
      select: ['week'],
    });
    return latestMatch?.week ?? 0;
  }

  async isSeasonScheduleComplete(
    leagueId: string,
    season: number,
    maxTeams: number = 16,
  ): Promise<boolean> {
    const matchCount = await this.matchRepository.count({
      where: { leagueId, season },
    });
    const expectedMatchCount = maxTeams * (maxTeams - 1);
    return matchCount >= expectedMatchCount;
  }

  async getTeamMatchesPlayed(teamId: string, season: number): Promise<number> {
    const homeMatches = await this.matchRepository.count({
      where: { homeTeamId: teamId, season, status: MatchStatus.COMPLETED },
    });
    const awayMatches = await this.matchRepository.count({
      where: { awayTeamId: teamId, season, status: MatchStatus.COMPLETED },
    });
    return homeMatches + awayMatches;
  }
}
