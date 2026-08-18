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
   *
   * Two kinds of matches are emitted per tier boundary:
   *
   *   1. **Lower-boundary (this league × children, 4
   *      matches).** This league's positions 9-12 swap
   *      with the corresponding #2 of each child league,
   *      in `tierDivision` order. See
   *      `generateLeaguePlayoffs` below.
   *
   *   2. **Upper-boundary (parent league × this league,
   *      1 match).** This league's #2 swaps with one of
   *      the parent league's #9-#12. The pairing is
   *      index-based: `this.tierDivision - 1` (mod 4)
   *      selects which of the four parent positions. So
   *      L2-D1 #2 ↔ L1 #9, L2-D2 #2 ↔ L1 #10, etc.
   *      See `generateUpperBoundaryPlayoff` below.
   *
   * Both kinds are 1:1 swaps (one upper team, one lower
   * team) so the per-tier net change is zero and the
   * per-pair swap balance holds across the whole
   * pyramid.
   */
  private async generatePyramidLevelPlayoffs(
    upperLeague: LeagueEntity,
    season: number,
    playoffDate: Date,
  ): Promise<PlayoffMatchInfo[]> {
    const matches: PlayoffMatchInfo[] = [];

    // Upper-boundary playoff: this league's #2 swaps
    // with one of the parent league's #9-#12.
    const upperMatch = await this.generateUpperBoundaryPlayoff(
      upperLeague,
      season,
      playoffDate,
    );
    if (upperMatch) matches.push(upperMatch);

    // Lower-boundary playoff: this league's #9-#12 swap
    // with each child's #2.
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

    // Recurse one level down — each child league also
    // has its own children to play off against. We also
    // need an upper-boundary match for each child, but
    // that's already handled by THIS league's
    // `generateLeaguePlayoffs` above (which pairs
    // this league's #9-12 with each child's #2). The
    // recursion's responsibility is to emit matches
    // *below* each child (the child as the upper
    // league of its own children).
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
   * Generate the upper-boundary playoff: this league's
   * position 2 vs one of the parent league's #9-#12.
   *
   * Returns `null` for the top tier (no parent league)
   * or when one of the two teams is missing from the
   * standings. The pairing rule is:
   *
   *   upperRelegationPos = (parentMaxTeams - parentRelegationSlots + 1) +
   *                         ((this.tierDivision - 1) mod parentRelegationSlots)
   *
   * For the production 16-team × 4-relegation-slot
   * pyramid this maps:
   *   L2-D1 (tierDivision=1) ↔ L1 #13   (direct relegation)
   *   L2-D2 (tierDivision=2) ↔ L1 #14
   *   L2-D3 (tierDivision=3) ↔ L1 #15
   *   L2-D4 (tierDivision=4) ↔ L1 #16
   *
   * The playoff-batch version of this same pairing is
   * what `processLeaguePromotions` commits directly
   * (no match row, just a swap). The match row here
   * exists so the FE/audit log can show "this game
   * decided the swap". After the match completes,
   * `SeasonTransitionService.processAfterPlayoffsComplete`
   * reads the result and calls `swapTeamLeague` (for
   * the lower side) — but on the upper side, the
   * direct-promotion swap has *already* been applied
   * by `processLeaguePromotions`. To avoid a double
   * swap, the `playoff_swapped_at` latch on the row
   * protects the upper side via a different code path
   * (see the comment there).
   */
  private async generateUpperBoundaryPlayoff(
    league: LeagueEntity,
    season: number,
    playoffDate: Date,
  ): Promise<PlayoffMatchInfo | null> {
    const parentLeague = await this.leagueRepository.findOne({
      where: { tier: league.tier - 1, tierDivision: league.tierDivision },
    });
    if (!parentLeague) {
      // Top tier (L1) or sibling-only tier — no upper
      // boundary to emit.
      return null;
    }

    const parentMaxTeams = parentLeague.maxTeams || 16;
    const parentRelegationSlots = parentLeague.relegationSlots || 4;
    const parentRelegationStart = parentMaxTeams - parentRelegationSlots + 1;
    const upperRelegationPos =
      parentRelegationStart +
      ((league.tierDivision - 1) % parentRelegationSlots);

    const ourSecond = await this.standingRepository.findOne({
      where: { leagueId: league.id, season, position: 2 },
      relations: ['team'],
    });
    const parentInPlayoffZone = await this.standingRepository.findOne({
      where: { leagueId: parentLeague.id, season, position: upperRelegationPos },
      relations: ['team'],
    });

    if (!ourSecond || !ourSecond.team || !parentInPlayoffZone || !parentInPlayoffZone.team) {
      this.logger.warn(
        `[Playoff] Missing #2 for ${league.name} or missing #${upperRelegationPos} for ${parentLeague.name} — upper boundary skipped`,
      );
      return null;
    }

    this.logger.info(
      `Playoff (upper): ${parentInPlayoffZone.team.name} (Home, ${parentLeague.name} #${upperRelegationPos}) vs ${ourSecond.team.name} (Away, ${league.name} #2)`,
    );

    return {
      homeTeamId: parentInPlayoffZone.team.id,
      awayTeamId: ourSecond.team.id,
      homeLeagueId: parentLeague.id,
      awayLeagueId: league.id,
      scheduledAt: playoffDate,
      season,
      week: 16,
    };
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
