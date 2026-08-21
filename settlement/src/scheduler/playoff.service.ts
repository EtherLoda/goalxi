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
   * The walk starts at the top tier (L1) and recurses
   * down via `parentLeagueId`. At each tier boundary
   * we emit the **lower-boundary** matches only: this
   * league's positions 9-12 paired (index-based) with
   * each child league's #2. The pairing is `tierDivision`
   * ordered — upper #9 ↔ child[0] #2, upper #10 ↔
   * child[1] #2, etc. The `parentLeagueId` filter
   * scopes each upper league to its own children, so
   * cross-branch leaks (the historical `where
   * (league.tier = :tier)` bug, where one child's #2
   * ended up in 4 different upper-league playoff rows)
   * can't happen.
   *
   * The upper-boundary case (this league #2 vs parent
   * #9-#12) is intentionally **not** generated here —
   * it's the same fixture as the parent league's
   * lower-boundary, viewed from the other side. Emitting
   * it would create a duplicate match row. See
   * `generatePyramidLevelPlayoffs` for the full
   * reasoning.
   *
   * For the production 1+4+16+64 pyramid the
   * per-season emission is:
   *   L1 lower-boundary: 4 matches (L1 #9-12 ↔ L2-D1..D4 #2)
   *   L2 lower-boundary: 16 matches (each L2-Dk #9-12 ↔ L3 children #2)
   *   L3 lower-boundary: 64 matches (each L3-Dk #9-12 ↔ L4 children #2)
   *   Total: 84 matches, no duplicates, per-tier 0-net.
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
   * The recursion stops at the bottom of the pyramid
   * (no children).
   *
   * Only **lower-boundary** matches are emitted. The
   * upper-boundary case (this league #2 vs parent
   * #9-#12) is the SAME match as the parent league's
   * lower-boundary (parent #9-#12 vs this league #2) —
   * a single fixture viewed from two angles. Generating
   * both sides would emit duplicate match rows, so we
   * pick the convention: the *parent* league's
   * lower-boundary is the canonical row. This is also
   * the perspective that matches production sports
   * database design (e.g. Bundesliga's relegation
   * playoff: home team = higher league, away team =
   * lower league).
   *
   * So when called from `generateAllPlayoffMatches`
   * with the top-tier league (L1), the recursion emits:
   *   L1 #9-12 ↔ L2-D1..D4 #2   (4 matches)
   *   L2-D1 #9-12 ↔ L3-D1..D4 #2   (4 matches, per L2 division)
   *   L2-D2 #9-12 ↔ L3-D5..D8 #2
   *   ... etc
   *   L3-D1 #9-12 ↔ L4-D1..D4 #2
   *   ... etc
   *
   * For the production 1+4+16+64 pyramid that's
   * 4 + 16 + 64 = 84 matches. No duplicates, no
   * orphans, every tier keeps a 0-net swap balance
   * because each match is a 1:1 swap decided on the
   * pitch.
   */
  private async generatePyramidLevelPlayoffs(
    upperLeague: LeagueEntity,
    season: number,
    playoffDate: Date,
  ): Promise<PlayoffMatchInfo[]> {
    const matches: PlayoffMatchInfo[] = [];

    // Lower-boundary playoff: this league's #9-#12 vs
    // each child league's #2. Index-based pairing in
    // `tierDivision` order, so L1 #9 ↔ L2-D1 #2,
    // L1 #10 ↔ L2-D2 #2, etc.
    const children = await this.leagueRepository.find({
      where: { parentLeagueId: upperLeague.id },
      order: { tierDivision: 'ASC' },
    });

    if (children.length > 0) {
      const lowerMatches = await this.generateLeaguePlayoffs(
        upperLeague,
        children,
        season,
        playoffDate,
      );
      matches.push(...lowerMatches);
    }

    // Recurse one level down — each child league
    // becomes the "upper" league of its own tier
    // boundary, so its own #9-#12 will be paired with
    // its children's #2.
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
    nextWednesday.setUTCHours(GAME_SETTINGS.MATCH_KICKOFF_HOUR_UTC, 0, 0, 0);
    return nextWednesday;
  }
}
