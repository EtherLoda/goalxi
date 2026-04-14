import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MatchEntity, MatchStatus, MatchType } from '@goalxi/database';
import { PromotionRelegationService } from './promotion-relegation.service';
import { PlayoffService } from './playoff.service';
import { SeasonSchedulerService } from './season-scheduler.service';
import { LeagueStandingService } from './league-standing.service';

@Injectable()
export class SeasonTransitionService {
  private readonly logger = new Logger(SeasonTransitionService.name);

  // 标记是否正在处理赛季过渡，防止重复触发
  private isTransitioning = false;

  constructor(
    @InjectRepository(MatchEntity)
    private readonly matchRepository: Repository<MatchEntity>,
    private readonly promotionService: PromotionRelegationService,
    private readonly playoffService: PlayoffService,
    private readonly seasonSchedulerService: SeasonSchedulerService,
    private readonly leagueStandingService: LeagueStandingService,
  ) {}

  /**
   * 每周一 00:00 检查是否需要触发赛季过渡
   * 条件：Week 15 结束，所有 Week 15 比赛已完成
   */
  @Cron('0 0 * * 1') // 每周一 00:00
  async checkSeasonTransition() {
    if (this.isTransitioning) {
      this.logger.log(
        '[SeasonTransition] Transition already in progress, skipping...',
      );
      return;
    }

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

    // 触发赛季过渡
    await this.executeSeasonTransition(currentSeasonWeek.season);
  }

  /**
   * 执行赛季过渡
   */
  async executeSeasonTransition(currentSeason: number): Promise<void> {
    if (this.isTransitioning) {
      this.logger.log('[SeasonTransition] Transition already in progress');
      return;
    }

    this.isTransitioning = true;
    this.logger.log(
      `[SeasonTransition] Starting Season ${currentSeason} → ${currentSeason + 1} transition`,
    );

    try {
      // 1. 生成附加赛（Week 16）
      this.logger.log(
        '[SeasonTransition] Step 1: Generating playoff matches...',
      );
      const playoffMatches =
        await this.playoffService.generateAllPlayoffMatches(currentSeason);
      this.logger.log(
        `[SeasonTransition] Generated ${playoffMatches.length} playoff matches`,
      );

      // 等待附加赛完成（这里需要等待到周三晚上8点比赛结束）
      // TODO: 实际实现应该等待 match completion 事件触发
      // 暂时用 setTimeout 模拟，实际应该用队列事件驱动
      this.logger.log(
        '[SeasonTransition] Playoffs scheduled, waiting for completion...',
      );
    } catch (error) {
      this.logger.error(
        `[SeasonTransition] Error during transition: ${error.message}`,
        error.stack,
      );
      this.isTransitioning = false;
      throw error;
    }
  }

  /**
   * 附加赛完成后的处理
   * 由 match-completion 队列在所有 Week 16 附加赛完成后触发
   */
  async processAfterPlayoffsComplete(currentSeason: number): Promise<void> {
    if (!this.isTransitioning) {
      this.logger.warn('[SeasonTransition] Not in transition state');
      return;
    }

    try {
      // 2. 处理附加赛结果并执行升降级
      this.logger.log(
        '[SeasonTransition] Step 2: Processing playoff results and executing promotions/relegations...',
      );
      await this.processPlayoffResults(currentSeason);

      // 3. 归档当前赛季排名
      this.logger.log(
        '[SeasonTransition] Step 3: Archiving current season standings...',
      );
      await this.leagueStandingService.archiveSeasonFinalStandings(
        currentSeason,
      );

      // 4. 生成新赛季赛程
      this.logger.log(
        '[SeasonTransition] Step 4: Generating next season schedule...',
      );
      const nextSeason = currentSeason + 1;
      await this.seasonSchedulerService.generateNextSeasonSchedule(
        currentSeason,
      );

      // 5. 初始化新赛季排行榜
      this.logger.log(
        '[SeasonTransition] Step 5: Initializing new season standings...',
      );
      await this.leagueStandingService.initNewSeasonStandings(nextSeason);

      this.logger.log(
        `[SeasonTransition] Season ${currentSeason} → ${nextSeason} transition completed!`,
      );
    } catch (error) {
      this.logger.error(
        `[SeasonTransition] Error during post-playoff processing: ${error.message}`,
        error.stack,
      );
    } finally {
      this.isTransitioning = false;
    }
  }

  /**
   * 处理附加赛结果并执行升降级
   */
  private async processPlayoffResults(season: number): Promise<void> {
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

    // 执行其他升降级（直接升级/降级）
    await this.promotionService.processAllTiers(season);
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
      return { season: 1, week: 1 };
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
}
