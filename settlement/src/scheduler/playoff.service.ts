import { Injectable, Inject } from '@nestjs/common';
import { LOGGER_SERVICE, PinoLoggerService } from '@goalxi/logger';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  GAME_SETTINGS,
  LeagueEntity,
  LeagueStandingEntity,
  MatchEntity,
  MatchStatus,
  MatchType,
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
  constructor(
    @Inject(LOGGER_SERVICE)
    private readonly logger: PinoLoggerService,
    @InjectRepository(MatchEntity)
    private readonly matchRepository: Repository<MatchEntity>,
    @InjectRepository(LeagueEntity)
    private readonly leagueRepository: Repository<LeagueEntity>,
    @InjectRepository(LeagueStandingEntity)
    private readonly standingRepository: Repository<LeagueStandingEntity>,
  ) {}

  /**
   * Generate the promotion/relegation playoff fixtures for
   * every senior league in the pyramid.
   *
   * For each league whose tier < MAX_TIER, we pair the
   * upper league's positions 9-12 with the lower tier's
   * corresponding #2 teams. The pairing is index-based
   * (upper #9 ↔ lower league[0] #2, upper #10 ↔ lower
   * league[1] #2, etc.) which assumes the lower tier's
   * leagues are returned in `parentLeagueId` order. With
   * the `parentLeagueId` filter, each upper league only
   * sees its own child lower-tier leagues (e.g. L2-D1
   * only sees L3-D1..D4), which is what the index-based
   * pairing was implicitly designed for — the historical
   * `where('league.tier = :tier', ...)` filter pulled
   * every lower-tier league across the entire tier, so
   * the same lower team's #2 ended up in 4 different
   * playoff rows (one per upper-league division) and the
   * `playoffSwappedAt` latch on
   * `SeasonTransitionService.processAfterPlayoffsComplete`
   * could only act on the first swap.
   */
  async generateAllPlayoffMatches(season: number): Promise<PlayoffMatchInfo[]> {
    const allMatches: PlayoffMatchInfo[] = [];
    const playoffDate = this.getNextPlayoffDate();

    // Walk the pyramid top-down so each league's playoff
    // batch is computed exactly once. Using the
    // `LeagueEntity` repository (not
    // `matchRepository.manager.createQueryBuilder(...)`,
    // which is a code smell — we're querying a different
    // entity than the one we started from).
    const leagues = await this.leagueRepository.find({
      where: { tier: 1 },
      order: { tier: 'ASC' },
    });

    for (const topLeague of leagues) {
      const playoffMatches = await this.generatePyramidLevelPlayoffs(
        topLeague,
        season,
        playoffDate,
      );
      allMatches.push(...playoffMatches);
    }

    // 保存所有附加赛
    await this.savePlayoffMatches(allMatches);
    this.logger.info(
      `Generated ${allMatches.length} playoff matches for Season ${season}`,
    );

    return allMatches;
  }

  /**
   * Recursively descend the pyramid from `upperLeague`,
   * generating playoff matches at every tier boundary.
   * The recursion stops at MAX_TIER (the bottom of the
   * pyramid, no children).
   */
  private async generatePyramidLevelPlayoffs(
    upperLeague: LeagueEntity,
    season: number,
    playoffDate: Date,
  ): Promise<PlayoffMatchInfo[]> {
    const children = await this.leagueRepository.find({
      where: { parentLeagueId: upperLeague.id },
      order: { tierDivision: 'ASC' },
    });

    if (children.length === 0) {
      return [];
    }

    const matches = await this.generateLeaguePlayoffs(
      upperLeague,
      children,
      season,
      playoffDate,
    );

    // Recurse one level down — each child league also
    // has its own children to play off against.
    for (const child of children) {
      const childMatches = await this.generatePyramidLevelPlayoffs(
        child,
        season,
        playoffDate,
      );
      matches.push(...childMatches);
    }

    return matches;
  }

  /**
   * For a single upper league, generate the playoff
   * matches pairing its positions 9-12 with each child
   * league's #2 team (1:1, index-based).
   */
  private async generateLeaguePlayoffs(
    upperLeague: LeagueEntity,
    lowerLeagues: LeagueEntity[],
    season: number,
    playoffDate: Date,
  ): Promise<PlayoffMatchInfo[]> {
    const matches: PlayoffMatchInfo[] = [];

    const maxTeams = upperLeague.maxTeams || 16;
    const playoffSlots = upperLeague.playoffSlots || 4;
    const relegationSlots = upperLeague.relegationSlots || 4;

    // Calculate playoff positions: e.g., for 16-team league with 4 playoff slots and 4 relegation slots
    // positions = [16 - 4 - 4 + 1 = 9, to 16 - 4 = 12]
    const playoffStart = maxTeams - playoffSlots - relegationSlots + 1;
    const playoffEnd = maxTeams - relegationSlots;

    const upperStandings = await this.standingRepository.find({
      where: { leagueId: upperLeague.id, season },
      relations: ['team'],
      order: { position: 'ASC' },
    });

    const playoffPositions = upperStandings.filter(
      (s) => s.position >= playoffStart && s.position <= playoffEnd,
    );

    for (
      let i = 0;
      i < playoffPositions.length && i < lowerLeagues.length;
      i++
    ) {
      const upperStanding = playoffPositions[i];
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

      matches.push({
        homeTeamId: upperStanding.teamId,
        awayTeamId: lowerStanding.teamId,
        homeLeagueId: upperLeague.id,
        awayLeagueId: lowerLeague.id,
        scheduledAt: playoffDate,
        season,
        week: 16,
      });

      this.logger.info(
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
   * Next Wednesday at `GAME_SETTINGS.MATCH_KICKOFF_HOUR_UTC`
   * (currently 6:00 UTC = 14:00 China time). The historical
   * implementation used `setHours(20, ...)` in the
   * *server's local timezone*, which didn't match the
   * regular-season kickoff hour or the rest of the
   * cron layer that anchors on UTC.
   */
  private getNextPlayoffDate(): Date {
    const now = new Date();
    const dayOfWeek = now.getUTCDay();
    // 周三 = 3 (UTC).
    const rawDaysToWed = (3 - dayOfWeek + 7) % 7;
    // 0 means today is Wednesday — push to next Wednesday
    // so the playoff always lands on a future date even if
    // the cron fires on a Wednesday.
    const daysUntilWednesday = rawDaysToWed === 0 ? 7 : rawDaysToWed;
    const nextWednesday = new Date(now);
    nextWednesday.setUTCDate(now.getUTCDate() + daysUntilWednesday);
    nextWednesday.setUTCHours(
      GAME_SETTINGS.MATCH_KICKOFF_HOUR_UTC,
      0,
      0,
      0,
    );
    return nextWednesday;
  }
}
