import { Injectable, Inject } from '@nestjs/common';
import { LOGGER_SERVICE, PinoLoggerService } from '@goalxi/logger';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  MatchEntity,
  MatchStatus,
  MatchType,
  GAME_SETTINGS,
  currentSeasonWeek,
  resolveGameStart,
} from '@goalxi/database';
import { IsNull, In } from 'typeorm';
import { PromotionRelegationService } from './promotion-relegation.service';
import { PlayoffService } from './playoff.service';
import { SeasonSchedulerService } from './season-scheduler.service';
import { LeagueStandingService } from './league-standing.service';
import { SeasonArchiveService } from '../services/season-archive.service';

/**
 * The last week of a season. Playoffs are played in this week and
 * the regular-season ladder is decided by week `PLAYOFF_TRIGGER_WEEK`.
 *
 * Both are derived from `GAME_SETTINGS.SEASON_LENGTH_WEEKS` rather
 * than hardcoded, because the two disagreeing is what made the
 * playoffs unschedulable (see `checkAndGeneratePlayoffs`).
 */
const SEASON_LAST_WEEK = GAME_SETTINGS.SEASON_LENGTH_WEEKS;
const PLAYOFF_TRIGGER_WEEK = SEASON_LAST_WEEK - 1;

import { CronLocked } from '../common/cron-lock/cron-lock.decorator';
import { CronLockService } from '../common/cron-lock/cron-lock.service';

@Injectable()
export class SeasonTransitionService {
  @Inject(CronLockService)
  private readonly cronLock!: CronLockService;

  // Resolved once at construction. Used by both cron handlers
  // so the trigger conditions (`week === 15`, `week === 0/1`)
  // see the same value that the rest of the system does
  // (api, simulator, settlement workers). Previously this
  // service derived "current week" by querying the latest
  // match row, which could disagree with the rest of the
  // system by one full season — see the audit log #B-3.
  //
  // Exposed for tests so they can pin both `now` (via
  // `jest.useFakeTimers`) and `gameStart` to produce the
  // desired (season, week) pair without a DB.
  readonly gameStart: Date;

  constructor(
    @Inject(LOGGER_SERVICE)
    private readonly logger: PinoLoggerService,
    @InjectRepository(MatchEntity)
    private readonly matchRepository: Repository<MatchEntity>,
    private readonly promotionService: PromotionRelegationService,
    private readonly playoffService: PlayoffService,
    private readonly seasonSchedulerService: SeasonSchedulerService,
    private readonly leagueStandingService: LeagueStandingService,
    private readonly seasonArchiveService: SeasonArchiveService,
  ) {
    this.gameStart = resolveGameStart(process.env.GAME_START_DATE);
  }

  /**
   * 每周一 00:00 — 在最后一周（Week 16）开始时生成附加赛
   *
   * ## 为什么 gate 是 `week === 16` 而不是 `week === 15`
   *
   * `currentSeasonWeek` 是 1-indexed、以周一为锚点的，所以 week N
   * 覆盖 `[gameStart + (N-1)周, gameStart + N周)` —— 也就是说**周 N
   * 是从周一开始的**。而 week 15 的联赛比赛排在该周的**周三/周六**
   * （`schedule.generator.ts` 的 Wed+Sat 赛程）。
   *
   * 原实现在周一的 00:00（= week 15 的**第一天**）检查
   * `areAllWeekMatchesCompleted(15)`。此刻 week 15 一场都还没踢，
   * 判定恒为 false → 打日志 return；下一个周一时已经是 week 16，
   * `week !== 15` 又直接 return。**结果是附加赛每季一场都不会生成**，
   * 第 9-12 名永远不升降级（`playoffSlots: 4` 全季白配）。
   *
   * 现在 gate 是 `week === 16`（最后一周的开始），此时 week 15 已经
   * 完整结束，检查的是 `PLAYOFF_TRIGGER_WEEK`(15) 的完成度。
   * 附加赛随后落在 week 16 的周三（`getNextPlayoffDate`）。
   */
  // Heaviest tick in the codebase: `processAllTiers` walks every tier
  // and `initNewSeasonStandings` writes ~1360 rows. 60 min crash
  // window.
  //
  // LOCK NAMING — why the three steps do NOT share one lock.
  //
  // They used to, on the reasoning that they are steps of one state
  // machine and "must not interleave". That is a category error: the
  // lock provides MUTUAL EXCLUSION between settlement replicas, not
  // ordering between steps. Ordering is already enforced by the gates
  // (`week === SEASON_LAST_WEEK` vs `week === 1`) and by the
  // `playoff_swapped_at` latch.
  //
  // Sharing a lock actively cost us the first two steps. Both fire at
  // `0 0 * * 1` with the same lock name, so on any given Monday exactly
  // ONE of them ran and the other was silently dropped by
  // `CronLockService.run` at `logger.debug`. It happened to be harmless
  // — the loser's own gate would have returned early anyway — which is
  // precisely what made it dangerous: a real tick lost this way would
  // have deferred a season transition by a week with nothing in the
  // logs. `processor-wiring.spec.ts` now asserts that no two crons share
  // both a cron expression and a lock name, which is the condition that
  // actually drops a tick.
  @Cron('0 0 * * 1', { timeZone: GAME_SETTINGS.CRON_TIME_ZONE }) // 每周一 00:00
  @CronLocked('settlement.season.playoffs', { ttlMs: 60 * 60_000 })
  async checkAndGeneratePlayoffs() {
    const currentSeasonWeek_ = currentSeasonWeek(new Date(), this.gameStart);

    this.logger.info(
      `[SeasonTransition] Checking Season ${currentSeasonWeek_.season}, Week ${currentSeasonWeek_.week}`,
    );

    // Fire on the FIRST Monday of the final week — by then the
    // regular season is over.
    if (currentSeasonWeek_.week !== SEASON_LAST_WEEK) {
      return;
    }

    // Verify the regular season (week 15) actually finished.
    const regularSeasonComplete = await this.areAllWeekMatchesCompleted(
      currentSeasonWeek_.season,
      PLAYOFF_TRIGGER_WEEK,
    );

    if (!regularSeasonComplete) {
      this.logger.info(
        `[SeasonTransition] Week ${PLAYOFF_TRIGGER_WEEK} matches not yet complete, deferring playoff generation`,
      );
      return;
    }

    this.logger.info(
      `[SeasonTransition] Week ${PLAYOFF_TRIGGER_WEEK} complete, generating playoff matches for Season ${currentSeasonWeek_.season}...`,
    );
    await this.generatePlayoffs(currentSeasonWeek_.season);
  }

  /**
   * 每周日 00:00 — 附加赛周（`PLAYOFF_TRIGGER_WEEK + 1`）内执行升降级互换
   *
   * The historical chain of bugs here, kept because the shape of the fix
   * depends on it:
   *
   *   1. The gate was `week === 16` evaluated on the Monday that week 16
   *      *began* — before a single playoff had been played, so
   *      `areAllPlayoffsCompleted` returned `true` vacuously (0 playoffs
   *      found), `processAfterPlayoffsComplete` no-op'd, and positions
   *      9-12 never changed league. The playoffs were not even GENERATED
   *      (`checkAndGeneratePlayoffs` had the mirror-image bug: `week !== 15`
   *      evaluated on the Monday week 15 began, when week 15 had not been
   *      played, so it deferred, and by the next Monday `week !== 15`
   *      returned outright).
   *   2. The swap was then moved to the Monday that starts week 1 — after
   *      the season number had already rolled over — which required a
   *      `season - 1` fudge to name the season it was actually swapping.
   *
   * Both are gone. The playoffs are generated on the Monday that starts the
   * playoff week (after the last regular week is verified complete) and
   * played that Wednesday; the swap runs the Sunday after, while the
   * season number still refers to the season that just finished.
   *
   * ## When this runs, and why the gate is not `week === 1`
   *
   * Timeline for one season-year (day 0 = Monday of week 1):
   *
   *   day 71  Mon 00:00  week 11  `checkAndGeneratePlayoffs`
   *   day 74  Wed 06:00  week 11  the playoffs are PLAYED
   *   day 76  Sun 00:00  week 11  ← this cron
   *   day 77  Mon 00:00  week 12  `checkAndProcessSeasonStart`
   *   day 78  Tue 06:00  week 12  round 1 kickoff
   *
   * This used to run on the Monday that starts week 1, which is *after*
   * the season number has already rolled over — hence the
   * `season - 1` fudge below and a comment explaining it. It now runs on
   * the Sunday that still belongs to the season whose playoffs just
   * finished, so the season number is already the right one and the
   * arithmetic disappears.
   *
   * The gate is `week === SEASON_LAST_WEEK` (the playoff week) rather
   * than `week === 1` because that is the week this cron is now in. The
   * completion check still has to pass: the playoffs are stamped
   * `week: SEASON_LENGTH_WEEKS` and played on the Wednesday, so a Sunday
   * run is 2 days clear of them.
   *
   * Why Sunday and not the following Monday: the season-start tick has to
   * generate ~20,400 fixtures across 1,360 teams, and it calls
   * `processAfterPlayoffsComplete(previousSeason)` as step 0 so a missed
   * swap retries before the ladder is committed. With the first kickoff on
   * Tuesday 06:00, a Monday season-start leaves under 6 hours for that
   * work. Moving the swap to Sunday restores a 30-hour buffer, and the
   * step-0 retry remains the safety net if Sunday's run fails.
   */
  @Cron('0 0 * * 0', { timeZone: GAME_SETTINGS.CRON_TIME_ZONE }) // 每周日 00:00
  @CronLocked('settlement.season.playoff-swap', { ttlMs: 60 * 60_000 })
  async processPlayoffResultsAndSwap() {
    const currentSeasonWeek_ = currentSeasonWeek(new Date(), this.gameStart);

    // The playoff week is the last week of the season-year, and the
    // playoffs belong to THAT season — no `season - 1` needed.
    if (currentSeasonWeek_.week !== SEASON_LAST_WEEK) {
      return;
    }

    const finishedSeason = currentSeasonWeek_.season;

    const playoffsComplete = await this.areAllPlayoffsCompleted(finishedSeason);
    if (!playoffsComplete) {
      this.logger.warn(
        `[SeasonTransition] Season ${finishedSeason} playoff matches not all complete — skipping swap. ` +
          `Positions 9-12 will not change league this season.`,
      );
      return;
    }

    this.logger.info(
      `[SeasonTransition] Season ${finishedSeason} playoffs complete, processing swap...`,
    );
    await this.processAfterPlayoffsComplete(finishedSeason);
  }

  /**
   * 新赛季第一周第一天（周一 00:00）执行升降级和生成新赛季赛程
   * 在 Week 1 第一场比赛（周二 06:00）前触发
   *
   * Monday, not Tuesday: round 1 kicks off Tuesday 06:00 and this tick has
   * to promote/relegate, archive the season, write ~1,360 standings rows
   * and generate ~20,400 fixtures. On Tuesday that was under 6 hours of
   * headroom. Monday restores 30.
   *
   * Note: the playoff-result swap happens in the separate
   * `processPlayoffResultsAndSwap` cron above, on the Sunday that ends the
   * playoff week. It is re-invoked here as step 0 — idempotent via the
   * `playoff_swapped_at` latch — so a failed Sunday still gets retried
   * before this method commits the rest of the ladder.
   */
  @Cron('0 0 * * 1', { timeZone: GAME_SETTINGS.CRON_TIME_ZONE }) // 每周一 00:00
  @CronLocked('settlement.season.start', { ttlMs: 60 * 60_000 })
  async checkAndProcessSeasonStart() {
    const currentSeasonWeek_ = currentSeasonWeek(new Date(), this.gameStart);

    // Trigger only in Week 1 of the new season. (Week 0 is
    // unreachable under 1-indexed currentSeasonWeek; the previous
    // dual-week guard was effectively `week === 1` with a dead
    // sibling branch.)
    if (currentSeasonWeek_.week !== 1) {
      return;
    }

    const previousSeason = currentSeasonWeek_.season;
    const newSeason = previousSeason + 1;

    this.logger.info(
      `[SeasonTransition] Processing Season ${newSeason} start (after Season ${previousSeason})...`,
    );

    try {
      // 0. 附加赛互换（重试）。
      //
      // `processPlayoffResultsAndSwap` already ran on the preceding
      // Sunday and is idempotent via the `playoff_swapped_at` latch,
      // so this is a no-op in the happy path. It runs here too so that
      // a Sunday failure retries BEFORE step 1 commits the rest of the
      // ladder — otherwise direct promotions would be applied on a
      // season whose playoff results were silently dropped.
      this.logger.info(
        '[SeasonTransition] Step 0: Retrying un-swapped playoff results (idempotent)...',
      );
      await this.processAfterPlayoffsComplete(previousSeason);

      // 1. 执行升降级（基于上赛季排名）
      this.logger.info(
        '[SeasonTransition] Step 1: Executing promotions/relegations...',
      );
      await this.promotionService.processAllTiers(previousSeason);

      // 2. 归档上赛季数据
      this.logger.info(
        '[SeasonTransition] Step 2: Archiving previous season data...',
      );
      const archiveSummary =
        await this.seasonArchiveService.archiveSeason(previousSeason);
      this.logger.info(
        `[SeasonTransition] Archived: seasonResults=${archiveSummary.seasonResultCount}, playerStats=${archiveSummary.playerStatsCount}, transactions=${archiveSummary.transactionCount}, playerEvents=${archiveSummary.playerEventCount}`,
      );

      // 3. 初始化新赛季排行榜（根据新的 leagueId）
      this.logger.info(
        '[SeasonTransition] Step 3: Initializing new season standings...',
      );
      await this.leagueStandingService.initNewSeasonStandings(newSeason);

      // 4. 生成新赛季赛程
      this.logger.info(
        '[SeasonTransition] Step 4: Generating new season schedule...',
      );
      await this.seasonSchedulerService.generateNextSeasonSchedule(
        previousSeason,
      );

      this.logger.info(
        `[SeasonTransition] Season ${newSeason} setup completed!`,
      );
    } catch (error) {
      this.logger.error(
        `[SeasonTransition] Error during season start processing: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * 生成附加赛（赛季末 Week 15 结束后调用）
   */
  async generatePlayoffs(season: number): Promise<void> {
    try {
      this.logger.info(
        `[SeasonTransition] Generating playoff matches for Season ${season}...`,
      );
      const playoffMatches =
        await this.playoffService.generateAllPlayoffMatches(season);
      this.logger.info(
        `[SeasonTransition] Generated ${playoffMatches.length} playoff matches`,
      );
    } catch (error) {
      this.logger.error(
        `[SeasonTransition] Error generating playoffs: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * 处理附加赛结果并执行升降级(由 `processPlayoffResultsAndSwap`
   * 在 week 16 调用,不再嵌在 season start 流程里)
   *
   * Idempotency: filters on `playoffSwappedAt IS NULL` and stamps
   * the column after the swap commits. Re-running the cron (a
   * duplicate tick, a re-delivered message, a manual re-deploy)
   * finds 0 candidates and is a no-op. Without this, the second
   * run would un-swap every promoted/relegated pair because
   * `swapTeamLeague` is itself not commutative.
   */
  async processAfterPlayoffsComplete(season: number): Promise<void> {
    // Get only playoff matches that haven't been swapped yet. The
    // `playoffSwappedAt IS NULL` filter is the idempotency latch.
    const playoffMatches = await this.matchRepository.find({
      where: {
        season,
        week: SEASON_LAST_WEEK,
        type: MatchType.PLAYOFF,
        status: MatchStatus.COMPLETED,
        playoffSwappedAt: IsNull(),
      },
      relations: ['homeTeam', 'awayTeam', 'league'],
    });

    this.logger.info(
      `[SeasonTransition] Processing ${playoffMatches.length} un-swapped playoff results`,
    );

    if (playoffMatches.length === 0) {
      return;
    }

    // Every row we just read came back with `playoffSwappedAt IS NULL`
    // (the WHERE filter), so they all need the latch stamped at the
    // end of this call — even if no swap fires (lowerLeagueId is null,
    // or the home team won). Otherwise the next tick re-reads them
    // and re-evaluates the same logic.
    const allMatchIds = playoffMatches.map((m) => m.id);

    // Build swap candidates. Rows with no lowerLeagueId are still
    // "processed" (and stamped) but don't trigger a swap — they're
    // e.g. single-tier playoffs or cup ties that aren't actually
    // promotion/relegation fixtures.
    const candidates = playoffMatches
      .filter((match) => match.lowerLeagueId != null)
      .map((match) => ({
        matchId: match.id,
        homeTeam: match.homeTeam!,
        awayTeam: match.awayTeam!,
        homeLeague: match.league!,
        awayLeagueId: match.lowerLeagueId as string,
        homeWon:
          match.homeScore !== undefined &&
          match.awayScore !== undefined &&
          match.homeScore > match.awayScore,
      }));

    for (const result of candidates) {
      if (result.homeWon) {
        // 主队赢（上级球队），保持原 leagueId
        this.logger.info(
          `${result.homeTeam.name} won playoff, stays in ${result.homeLeague.name}`,
        );
      } else {
        // 客队赢（下级球队），互换 leagueId
        const awayLeague = await this.matchRepository.manager
          .getRepository('league')
          .findOne({ where: { id: result.awayLeagueId } });

        await this.promotionService.swapTeamLeague(
          result.homeTeam.id,
          result.awayTeam.id,
          result.homeLeague.id,
          result.awayLeagueId,
        );

        this.logger.info(
          `${result.awayTeam.name} won playoff, promoted to ${result.homeLeague.name}; ` +
            `${result.homeTeam.name} relegated to ${(awayLeague as any)?.name || result.awayLeagueId}`,
        );
      }
    }

    // Stamp the latch in one batched UPDATE so a re-run of this
    // method sees the same playoff matches as already-processed
    // and skips them. Covers every row we read, even if no swap
    // fired for it.
    const stampedAt = new Date();
    await this.matchRepository.update(
      { id: In(allMatchIds) },
      { playoffSwappedAt: stampedAt },
    );
    this.logger.info(
      `[SeasonTransition] Stamped playoff_swapped_at on ${allMatchIds.length} match(es)`,
    );
  }

  /**
   * 检查指定周的所有比赛是否完成
   */
  private async areAllWeekMatchesCompleted(
    season: number,
    week: number,
  ): Promise<boolean> {
    const totalMatches = await this.matchRepository.count({
      where: { season, week, type: MatchType.LEAGUE },
    });

    if (totalMatches === 0) {
      return false;
    }

    const completedMatches = await this.matchRepository.count({
      where: {
        season,
        week,
        type: MatchType.LEAGUE,
        status: MatchStatus.COMPLETED,
      },
    });

    return completedMatches >= totalMatches;
  }

  /**
   * 检查所有附加赛是否完成
   *
   * Deliberately does NOT filter on `week`: a playoff is a playoff
   * regardless of which week column it was stamped with, and a
   * week-scoped count would silently report "all complete" for any
   * playoff that ended up stamped with a different week.
   */
  private async areAllPlayoffsCompleted(season: number): Promise<boolean> {
    const totalPlayoffs = await this.matchRepository.count({
      where: {
        season,
        type: MatchType.PLAYOFF,
      },
    });

    if (totalPlayoffs === 0) {
      // 没有附加赛，直接返回true（可能是单级联赛没有升降级）
      return true;
    }

    const completedPlayoffs = await this.matchRepository.count({
      where: {
        season,
        type: MatchType.PLAYOFF,
        status: MatchStatus.COMPLETED,
      },
    });

    return completedPlayoffs >= totalPlayoffs;
  }
}
