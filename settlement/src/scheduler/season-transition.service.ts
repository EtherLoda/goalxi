import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MatchEntity, MatchStatus, MatchType } from '@goalxi/database';
import { PromotionRelegationService } from './promotion-relegation.service';
import { PlayoffService } from './playoff.service';
import { SeasonSchedulerService } from './season-scheduler.service';
import { LeagueStandingService } from './league-standing.service';
import { SeasonArchiveService } from '../services/season-archive.service';

@Injectable()
export class SeasonTransitionService {
  private readonly logger = new Logger(SeasonTransitionService.name);

  constructor(
    @InjectRepository(MatchEntity)
    private readonly matchRepository: Repository<MatchEntity>,
    private readonly promotionService: PromotionRelegationService,
    private readonly playoffService: PlayoffService,
    private readonly seasonSchedulerService: SeasonSchedulerService,
    private readonly leagueStandingService: LeagueStandingService,
    private readonly seasonArchiveService: SeasonArchiveService,
  ) {}

  /**
   * 每周一 00:00 检查是否需要生成附加赛
   * 条件：Week 15 结束，所有 Week 15 比赛已完成
   */
  @Cron('0 0 * * 1') // 每周一 00:00
  async checkAndGeneratePlayoffs() {
    const currentSeasonWeek = await this.getCurrentSeasonAndWeek();

    this.logger.log(
      `[SeasonTransition] Checking Season ${currentSeasonWeek.season}, Week ${currentSeasonWeek.week}`,
    );

    // 检查是否 Week 15 结束
    if (currentSeasonWeek.week !== 15) {
      return;
    }

    // 检查 Week 15 所有联赛比赛是否完成
    const week15Complete = await this.areAllWeekMatchesCompleted(
      currentSeasonWeek.season,
      currentSeasonWeek.week,
    );

    if (!week15Complete) {
      this.logger.log('[SeasonTransition] Week 15 matches not yet complete');
      return;
    }

    // 生成附加赛
    this.logger.log(
      `[SeasonTransition] Week 15 complete, generating playoff matches for Season ${currentSeasonWeek.season}...`,
    );
    await this.generatePlayoffs(currentSeasonWeek.season);
  }

  /**
   * 新赛季第一天（周二 00:00）执行升降级和生成新赛季赛程
   * 在 Week 1 比赛开始前触发
   */
  @Cron('0 0 * * 2') // 每周二 00:00
  async checkAndProcessSeasonStart() {
    const currentSeasonWeek = await this.getCurrentSeasonAndWeek();

    // 只在赛季结束后处理（新赛季第0周或第1周开始时）
    // 如果是第0周说明附加赛刚结束，如果是第1周说明还没处理过
    if (currentSeasonWeek.week !== 0 && currentSeasonWeek.week !== 1) {
      return;
    }

    // 检查是否所有 Week 16 附加赛都已完成（如果是第0周）
    if (currentSeasonWeek.week === 0) {
      const playoffsComplete = await this.areAllPlayoffsCompleted(
        currentSeasonWeek.season,
      );
      if (!playoffsComplete) {
        this.logger.log('[SeasonTransition] Playoff matches not yet complete');
        return;
      }
    }

    const previousSeason = currentSeasonWeek.season;
    const newSeason = previousSeason + 1;

    this.logger.log(
      `[SeasonTransition] Processing Season ${newSeason} start (after Season ${previousSeason})...`,
    );

    try {
      // 1. 执行升降级（基于上赛季排名）
      this.logger.log(
        '[SeasonTransition] Step 1: Executing promotions/relegations...',
      );
      await this.promotionService.processAllTiers(previousSeason);

      // 2. 处理附加赛结果并执行互换升降级（如果有）
      this.logger.log(
        '[SeasonTransition] Step 2: Processing playoff results...',
      );
      await this.processAfterPlayoffsComplete(previousSeason);

      // 3. 归档上赛季数据
      this.logger.log(
        '[SeasonTransition] Step 3: Archiving previous season data...',
      );
      const archiveSummary = await this.seasonArchiveService.archiveSeason(
        previousSeason,
      );
      this.logger.log(
        `[SeasonTransition] Archived: seasonResults=${archiveSummary.seasonResultCount}, playerStats=${archiveSummary.playerStatsCount}, transactions=${archiveSummary.transactionCount}, playerEvents=${archiveSummary.playerEventCount}`,
      );

      // 4. 初始化新赛季排行榜（根据新的 leagueId）
      this.logger.log(
        '[SeasonTransition] Step 4: Initializing new season standings...',
      );
      await this.leagueStandingService.initNewSeasonStandings(newSeason);

      // 5. 生成新赛季赛程
      this.logger.log(
        '[SeasonTransition] Step 5: Generating new season schedule...',
      );
      await this.seasonSchedulerService.generateNextSeasonSchedule(
        previousSeason,
      );

      this.logger.log(
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
      this.logger.log(
        `[SeasonTransition] Generating playoff matches for Season ${season}...`,
      );
      const playoffMatches =
        await this.playoffService.generateAllPlayoffMatches(season);
      this.logger.log(
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
   * 处理附加赛结果并执行升降级
   */
  private async processAfterPlayoffsComplete(season: number): Promise<void> {
    // 获取所有 Week 16 的附加赛
    const playoffMatches = await this.matchRepository.find({
      where: {
        season,
        week: 16,
        type: MatchType.PLAYOFF,
        status: MatchStatus.COMPLETED,
      },
      relations: ['homeTeam', 'awayTeam', 'league'],
    });

    this.logger.log(
      `[SeasonTransition] Processing ${playoffMatches.length} playoff results`,
    );

    // 构建附加赛结果（过滤掉没有 lowerLeagueId 的比赛）
    const results = playoffMatches
      .filter((match) => match.lowerLeagueId != null)
      .map((match) => ({
        homeTeam: match.homeTeam!,
        awayTeam: match.awayTeam!,
        homeLeague: match.league!,
        awayLeagueId: match.lowerLeagueId as string,
        homeWon:
          match.homeScore !== undefined &&
          match.awayScore !== undefined &&
          match.homeScore > match.awayScore,
      }));

    // 处理升降级
    for (const result of results) {
      if (result.homeWon) {
        // 主队赢（上级球队），保持原 leagueId
        this.logger.log(
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

        this.logger.log(
          `${result.awayTeam.name} won playoff, promoted to ${result.homeLeague.name}; ` +
            `${result.homeTeam.name} relegated to ${(awayLeague as any)?.name || result.awayLeagueId}`,
        );
      }
    }
  }

  /**
   * 获取当前赛季和周数
   */
  private async getCurrentSeasonAndWeek(): Promise<{
    season: number;
    week: number;
  }> {
    const latestMatch = await this.matchRepository.findOne({
      where: { type: MatchType.LEAGUE },
      order: { scheduledAt: 'DESC' },
    });

    if (!latestMatch) {
      return { season: 1, week: 0 };
    }

    return { season: latestMatch.season, week: latestMatch.week };
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
