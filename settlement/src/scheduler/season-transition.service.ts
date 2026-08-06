import { Injectable, Inject } from '@nestjs/common';
import { LOGGER_SERVICE, PinoLoggerService } from '@goalxi/logger';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  MatchEntity,
  MatchStatus,
  MatchType,
  currentSeasonWeek,
  resolveGameStart,
} from '@goalxi/database';
import { IsNull, In } from 'typeorm';
import { PromotionRelegationService } from './promotion-relegation.service';
import { PlayoffService } from './playoff.service';
import { SeasonSchedulerService } from './season-scheduler.service';
import { LeagueStandingService } from './league-standing.service';
import { SeasonArchiveService } from '../services/season-archive.service';

@Injectable()
export class SeasonTransitionService {
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
   * 每周一 00:00 检查是否需要生成附加赛
   * 条件：Week 15 结束，所有 Week 15 比赛已完成
   */
  @Cron('0 0 * * 1') // 每周一 00:00
  async checkAndGeneratePlayoffs() {
    const currentSeasonWeek_ = currentSeasonWeek(new Date(), this.gameStart);

    this.logger.info(
      `[SeasonTransition] Checking Season ${currentSeasonWeek_.season}, Week ${currentSeasonWeek_.week}`,
    );

    // 检查是否 Week 15 结束
    if (currentSeasonWeek_.week !== 15) {
      return;
    }

    // 检查 Week 15 所有联赛比赛是否完成
    const week15Complete = await this.areAllWeekMatchesCompleted(
      currentSeasonWeek_.season,
      currentSeasonWeek_.week,
    );

    if (!week15Complete) {
      this.logger.info('[SeasonTransition] Week 15 matches not yet complete');
      return;
    }

    // 生成附加赛
    this.logger.info(
      `[SeasonTransition] Week 15 complete, generating playoff matches for Season ${currentSeasonWeek_.season}...`,
    );
    await this.generatePlayoffs(currentSeasonWeek_.season);
  }

  /**
   * 每周一 00:00 — Week 16 时执行附加赛结果的升降级互换
   *
   * Previously this lived inside `checkAndProcessSeasonStart` and
   * was guarded by `week === 0`. But `currentSeasonWeek` is
   * 1-indexed (range 1–16), so `week === 0` was unreachable and
   * the playoff swap silently never ran. Lifting it into its own
   * cron fired on `week === 16` makes the swap actually happen —
   * week 16's matches complete on the weekend, this fires on the
   * next Monday.
   */
  @Cron('0 0 * * 1') // 每周一 00:00
  async processPlayoffResultsAndSwap() {
    const currentSeasonWeek_ = currentSeasonWeek(new Date(), this.gameStart);

    if (currentSeasonWeek_.week !== 16) {
      return;
    }

    const playoffsComplete = await this.areAllPlayoffsCompleted(
      currentSeasonWeek_.season,
    );
    if (!playoffsComplete) {
      this.logger.info(
        '[SeasonTransition] Playoff matches not yet complete, skipping swap',
      );
      return;
    }

    this.logger.info(
      `[SeasonTransition] Week 16 playoffs complete, processing swap for Season ${currentSeasonWeek_.season}...`,
    );
    await this.processAfterPlayoffsComplete(currentSeasonWeek_.season);
  }

  /**
   * 新赛季第一天（周二 00:00）执行升降级和生成新赛季赛程
   * 在 Week 1 比赛开始前触发
   *
   * Note: playoff-result swap happens in the separate
   * `processPlayoffResultsAndSwap` cron above (week 16), not
   * here. The `week === 0` guard that used to live here is dead
   * code under the 1-indexed `currentSeasonWeek` helper and has
   * been removed.
   */
  @Cron('0 0 * * 2') // 每周二 00:00
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
        week: 16,
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
   */
  private async areAllPlayoffsCompleted(season: number): Promise<boolean> {
    const totalPlayoffs = await this.matchRepository.count({
      where: {
        season,
        week: 16,
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
        week: 16,
        type: MatchType.PLAYOFF,
        status: MatchStatus.COMPLETED,
      },
    });

    return completedPlayoffs >= totalPlayoffs;
  }
}
