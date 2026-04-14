import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  MatchEntity,
  MatchStatus,
  MatchType,
  LeagueStandingEntity,
} from '@goalxi/database';

export interface PlayoffMatchInfo {
  homeTeamId: string;
  awayTeamId: string;
  homeLeagueId: string;
  awayLeagueId: string;
  scheduledAt: Date;
  season: number;
  week: number;
}

@Injectable()
export class PlayoffService {
  private readonly logger = new Logger(PlayoffService.name);

  private readonly PLAYOFF_HOUR = 20;
  private readonly PLAYOFF_MINUTE = 0;

  constructor(
    @InjectRepository(MatchEntity)
    private readonly matchRepository: Repository<MatchEntity>,
    @InjectRepository(LeagueStandingEntity)
    private readonly standingRepository: Repository<LeagueStandingEntity>,
  ) {}

  /**
   * 为所有级别联赛生成附加赛
   * @param season 当前赛季
   * @returns 生成的附加赛信息数组
   */
  async generateAllPlayoffMatches(season: number): Promise<PlayoffMatchInfo[]> {
    const allMatches: PlayoffMatchInfo[] = [];
    const playoffDate = this.getNextPlayoffDate();

    // 获取所有联赛
    const leagues = await this.matchRepository.manager
      .createQueryBuilder(MatchEntity, 'match')
      .select('DISTINCT match.leagueId', 'leagueId')
      .innerJoin('match.league', 'league')
      .getRawMany();

    for (const { leagueId } of leagues) {
      const leagueMatches = await this.matchRepository.manager
        .createQueryBuilder(MatchEntity, 'match')
        .innerJoinAndSelect('match.league', 'league')
        .where('match.leagueId = :leagueId', { leagueId })
        .andWhere('match.season = :season', { season })
        .getOne();

      if (!leagueMatches?.league) continue;

      const league = leagueMatches.league;
      const tier = league.tier;

      // 获取上级联赛
      const upperLeague = await this.matchRepository.manager
        .createQueryBuilder(MatchEntity, 'match')
        .innerJoinAndSelect('match.league', 'league')
        .where('league.tier = :tier', { tier: tier - 1 })
        .andWhere('league.tierDivision = :tierDivision', {
          tierDivision: league.tierDivision,
        })
        .getOne();

      if (!upperLeague?.league) {
        this.logger.debug(
          `No upper league for Tier ${tier}, Division ${league.tierDivision}, skipping playoffs`,
        );
        continue;
      }

      // 获取下级联赛（如果有的话）
      const lowerLeagues = await this.matchRepository.manager
        .createQueryBuilder(MatchEntity, 'match')
        .innerJoinAndSelect('match.league', 'league')
        .where('league.tier = :tier', { tier: tier + 1 })
        .getMany();

      const validLowerLeagues = lowerLeagues
        .map((m) => m.league)
        .filter((l): l is NonNullable<typeof l> => l !== undefined);

      // 生成本联赛的附加赛（第9-12名 vs 下级联赛第2名）
      const playoffMatches = await this.generateLeaguePlayoffs(
        league,
        validLowerLeagues,
        season,
        playoffDate,
      );

      allMatches.push(...playoffMatches);
    }

    // 保存所有附加赛
    await this.savePlayoffMatches(allMatches);
    this.logger.log(
      `Generated ${allMatches.length} playoff matches for Season ${season}`,
    );

    return allMatches;
  }

  /**
   * 为单个联赛生成附加赛（第9-12名 vs 下级对应联赛第2名）
   */
  private async generateLeaguePlayoffs(
    upperLeague: any,
    lowerLeagues: any[],
    season: number,
    playoffDate: Date,
  ): Promise<PlayoffMatchInfo[]> {
    const matches: PlayoffMatchInfo[] = [];

    // 获取上级联赛第9-12名的球队
    const upperStandings = await this.standingRepository.find({
      where: { leagueId: upperLeague.id, season },
      relations: ['team'],
      order: { position: 'ASC' },
    });

    const positions9to12 = upperStandings.filter(
      (s) => s.position >= 9 && s.position <= 12,
    );

    // 获取下级各联赛第2名的球队
    for (let i = 0; i < positions9to12.length && i < lowerLeagues.length; i++) {
      const upperStanding = positions9to12[i];
      const lowerLeague = lowerLeagues[i];

      const lowerStanding = await this.standingRepository.findOne({
        where: { leagueId: lowerLeague.id, season, position: 2 },
        relations: ['team'],
      });

      if (!lowerStanding || !lowerStanding.team) {
        this.logger.warn(
          `No 2nd place team found in league ${lowerLeague.name} for playoff`,
        );
        continue;
      }

      // 上级联赛第9-12名主场，下级联赛第2名客场
      matches.push({
        homeTeamId: upperStanding.teamId,
        awayTeamId: lowerStanding.teamId,
        homeLeagueId: upperLeague.id,
        awayLeagueId: lowerLeague.id,
        scheduledAt: playoffDate,
        season,
        week: 16,
      });

      this.logger.log(
        `Playoff: ${upperStanding.team?.name || upperStanding.teamId} (Home, ${upperLeague.name} #${upperStanding.position}) vs ${lowerStanding.team?.name || lowerStanding.teamId} (Away, ${lowerLeague.name} #2)`,
      );
    }

    return matches;
  }

  /**
   * 保存所有附加赛到数据库
   */
  private async savePlayoffMatches(
    matches: PlayoffMatchInfo[],
  ): Promise<MatchEntity[]> {
    const matchEntities = matches.map((m) =>
      this.matchRepository.create({
        homeTeamId: m.homeTeamId,
        awayTeamId: m.awayTeamId,
        leagueId: m.homeLeagueId,
        lowerLeagueId: m.awayLeagueId,
        season: m.season,
        week: m.week,
        scheduledAt: m.scheduledAt,
        status: MatchStatus.SCHEDULED,
        type: MatchType.PLAYOFF,
        tacticsLocked: false,
        homeForfeit: false,
        awayForfeit: false,
      }),
    );

    return this.matchRepository.save(matchEntities);
  }

  /**
   * 获取下一个周三晚上8点
   */
  private getNextPlayoffDate(): Date {
    const now = new Date();
    const dayOfWeek = now.getDay();
    // 周三 = 3
    const daysUntilWednesday = (3 - dayOfWeek + 7) % 7 || 7;
    const nextWednesday = new Date(now);
    nextWednesday.setDate(now.getDate() + daysUntilWednesday);
    nextWednesday.setHours(this.PLAYOFF_HOUR, this.PLAYOFF_MINUTE, 0, 0);
    return nextWednesday;
  }
}
