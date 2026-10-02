import { Injectable, Inject } from '@nestjs/common';
import { LOGGER_SERVICE, PinoLoggerService } from '@goalxi/logger';
import { Cron } from '@nestjs/schedule';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import {
  PlayerCompetitionStatsEntity,
  PlayerEventEntity,
  PlayerEventType,
  LeagueStandingEntity,
  PlayerEntity,
  FinanceEntity,
  MatchEntity,
  MatchStatus,
  MatchType,
  LeagueEntity,
  TransactionEntity,
  TransactionType,
  GAME_SETTINGS,
  PRIZE_MONEY,
  currentSeasonWeek,
  resolveGameStart,
} from '@goalxi/database';

/**
 * Week the end-of-season awards are booked against. Matches the
 * `week: 16` literal that `awardPrizeMoney` used, now derived from
 * the same `GAME_SETTINGS.SEASON_LENGTH_WEEKS` the season-transition
 * crons key on, so the three can't drift.
 */
const SEASON_END_AWARD_WEEK = GAME_SETTINGS.SEASON_LENGTH_WEEKS;

/** Cash prize for each individual player award (boot / assists / tackles). */
const PLAYER_AWARD_BONUS = 100_000;

import { CronLocked } from '../common/cron-lock/cron-lock.decorator';
import { CronLockService } from '../common/cron-lock/cron-lock.service';

@Injectable()
export class LeagueAwardService {
  @Inject(CronLockService)
  private readonly cronLock!: CronLockService;

  /**
   * Resolved once at construction so the award cron sees the same
   * (season, week) pair as every other settlement cron, the API and the
   * simulator. See `getCurrentSeasonAndWeek` for why this used to be a
   * match-table query instead.
   */
  private readonly gameStart: Date;

  constructor(
    @Inject(LOGGER_SERVICE)
    private readonly logger: PinoLoggerService,
    // Only `matchRepo` and `dataSource` remain.
    //
    // The seven award paths used to take their repositories from
    // injection while the enclosing `processLeagueAwards` opened a
    // transaction — so they read and wrote through a DIFFERENT
    // connection than the transaction and were never actually part of
    // it. They now take an `EntityManager` and use
    // `manager.getRepository(...)`, which is what makes the per-league
    // award atomic. Leaving the injected repositories in place would
    // only invite the next author to reintroduce the same split.
    @InjectRepository(MatchEntity)
    private readonly matchRepo: Repository<MatchEntity>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {
    this.gameStart = resolveGameStart(process.env.GAME_START_DATE);
  }

  /**
   * 每周日 00:00 检查是否需要发放赛季奖项
   * 第15周周六比赛结束后（第15周日）触发
   */
  // Slowest weekly tick: 85 leagues, prize money + per-player
  // leader events. 30 min crash window.
  @Cron('0 0 * * 0', { timeZone: GAME_SETTINGS.CRON_TIME_ZONE }) // 每周日 00:00
  @CronLocked('settlement.league-award.season-end', { ttlMs: 30 * 60_000 })
  async checkAndProcessSeasonAwards() {
    const currentSeasonWeek = await this.getCurrentSeasonAndWeek();

    // 只在第15周之后处理
    if (currentSeasonWeek.week !== 15) {
      return;
    }

    // 检查第15周所有联赛比赛是否完成
    const weekComplete = await this.areAllWeekMatchesCompleted(
      currentSeasonWeek.season,
      currentSeasonWeek.week,
    );

    if (!weekComplete) {
      this.logger.info('[LeagueAward] Week 15 matches not yet complete');
      return;
    }

    this.logger.info(
      `[LeagueAward] Week 15 complete, processing Season ${currentSeasonWeek.season} awards...`,
    );
    await this.processSeasonAwards(currentSeasonWeek.season);
  }

  /**
   * 发放赛季末奖项（金靴、助攻王、抢断王、冠军、排名奖金）
   * 需在联赛最后一轮结束后调用
   */
  async processSeasonAwards(season: number): Promise<void> {
    // Collect the leagues that actually have a ladder this season.
    //
    // The previous query was `SELECT DISTINCT match.leagueId FROM match`
    // with NO WHERE clause — no season filter, no type filter. That
    // swept in cup and youth matches (which carry `leagueId = null`) and
    // every league from every other season. A NULL `leagueId` then ran
    // the whole award path against a nonexistent league.
    const leagues = await this.matchRepo.manager
      .createQueryBuilder(MatchEntity, 'match')
      .select('DISTINCT match.leagueId', 'leagueId')
      .where('match.season = :season', { season })
      .andWhere('match.leagueId IS NOT NULL')
      .andWhere('match.type IN (:...types)', {
        types: [MatchType.LEAGUE, MatchType.PLAYOFF],
      })
      .getRawMany<{ leagueId: string }>();

    this.logger.info(
      `[LeagueAward] Processing awards for ${leagues.length} league(s) in season ${season}`,
    );

    for (const { leagueId } of leagues) {
      await this.processLeagueAwards(leagueId, season);
    }

    this.logger.info(`[LeagueAward] Season ${season} awards processed`);
  }

  private async processLeagueAwards(
    leagueId: string,
    season: number,
  ): Promise<void> {
    // ONE transaction for all five award paths.
    //
    // ## Why this is atomic
    //
    // The idempotency latch below is "does a CHAMPIONSHIP_TITLE event
    // exist for this league+season". That only works if the latch and
    // everything it guards commit together. Previously the five paths
    // ran via `Promise.all` with NO transaction:
    //
    //   - `awardChampion` wrote one event per player in a loop of bare
    //     `save()` calls. Failing at player 11 of 16 left players 1-10
    //     with a title.
    //   - `awardPrizeMoney` paid teams one at a time. Failing at team 4
    //     of 8 left teams 1-3 paid.
    //   - `Promise.all` rejects on the first failure but does NOT cancel
    //     the others, so a `awardPrizeMoney` failure still let
    //     `awardChampion` finish writing its latch.
    //
    // On the next Sunday the latch was satisfied, so the league
    // returned early and the unpaid teams were PERMANENTLY skipped.
    // Partial awards were not recoverable by re-running.
    //
    // Making it atomic means a failure rolls back the latch too, so the
    // retry redoes the whole league correctly. It also stops
    // `Promise.all`'s partial application: on one connection the paths
    // now run sequentially and any throw aborts all of them.
    await this.dataSource.transaction(async (manager) => {
      // Idempotency check — MUST be scoped to this league, and MUST run
      // inside the transaction that writes the awards.
      //
      // This used to be `findOne({ season, eventType: CHAMPIONSHIP_TITLE })`
      // with no `leagueId`. `processSeasonAwards` loops over every league,
      // so the FIRST league processed created a championship event and
      // every subsequent league matched that row and returned early.
      // Net effect: exactly 1 of the 85 leagues received any award per
      // season — golden boot, assists leader, tackles leader, championship
      // titles and all prize money were silently dropped for the other 84.
      // This was a deterministic every-season failure, not a race.
      //
      // The unit test missed it because it mocked a single league.
      //
      // All four award types already write `leagueId` into the `details`
      // JSONB, so scoping on it needs no migration. There is no index on
      // the JSONB path — acceptable for an annual cron over a table that
      // only grows with discrete player events.
      const existingAwards = await manager
        .getRepository(PlayerEventEntity)
        .createQueryBuilder('pe')
        .where('pe.season = :season', { season })
        .andWhere('pe.eventType = :eventType', {
          eventType: PlayerEventType.CHAMPIONSHIP_TITLE,
        })
        .andWhere("pe.details->>'leagueId' = :leagueId", { leagueId })
        .getOne();

      if (existingAwards) {
        this.logger.info(
          `[LeagueAward] Awards already processed for league ${leagueId} season ${season}`,
        );
        return;
      }

      // Sequential, not `Promise.all`. On a single query runner
      // concurrent statements merely queue, and `Promise.all` rejects on
      // the first failure while letting the rest keep writing — the
      // partial-application shape this transaction exists to remove.
      await this.awardGoldenBoot(manager, leagueId, season);
      await this.awardAssistsLeader(manager, leagueId, season);
      await this.awardTacklesLeader(manager, leagueId, season);
      await this.awardChampion(manager, leagueId, season);
      await this.awardPrizeMoney(manager, leagueId, season);
    });
  }

  /**
   * 发放排名奖金给前8名球队
   */
  private async awardPrizeMoney(
    manager: EntityManager,
    leagueId: string,
    season: number,
  ): Promise<void> {
    // 获取联赛信息获取tier
    const league = await manager.getRepository(LeagueEntity).findOne({
      where: { id: leagueId as any },
    });
    if (!league) return;

    const tier = Math.min(league.tier, 5); // L5+ 用同一标准
    const prizeTable = PRIZE_MONEY[tier];
    if (!prizeTable) return;

    // 获取前8名排名
    const top8Standings = await manager
      .getRepository(LeagueStandingEntity)
      .find({
        where: { leagueId, season },
        order: { position: 'ASC' },
        take: 8,
        relations: ['team'],
      });

    const financeRepo = manager.getRepository(FinanceEntity);
    const transactionRepo = manager.getRepository(TransactionEntity);

    for (const standing of top8Standings) {
      const position = standing.position;
      // 3-4名用position 3的奖金，5-8名用position 5的奖金
      let prizePosition: number;
      if (position <= 2) {
        prizePosition = position;
      } else if (position <= 4) {
        prizePosition = 3;
      } else {
        prizePosition = 5;
      }

      const prizeAmount = prizeTable[prizePosition];
      if (!prizeAmount || prizeAmount === 0) continue;

      // Read the balance under a write lock. A club can occupy more
      // than one paid position only by accident, but the golden-boot /
      // assists / tackles awards all credit `addPrizeToTeam` earlier in
      // this same transaction, so this row may already be locked by us —
      // re-reading under `FOR UPDATE` is correct and idempotent within a
      // transaction (it does not self-deadlock).
      const finance = await financeRepo.findOne({
        where: { teamId: standing.teamId as any },
        lock: { mode: 'pessimistic_write' },
      });

      if (finance) {
        // 创建交易记录
        const transaction = transactionRepo.create({
          teamId: standing.teamId as any,
          amount: prizeAmount,
          type: TransactionType.PRIZE_MONEY,
          season,
          week: SEASON_END_AWARD_WEEK,
          description: `Season ${season} final position prize (${position}${this.getPositionSuffix(position)} in ${league.name})`,
        });
        await transactionRepo.save(transaction);

        // 更新余额
        finance.balance += prizeAmount;
        await financeRepo.save(finance);

        this.logger.info(
          `[LeagueAward] PRIZE: team=${standing.team?.name} position=${position} amount=£${prizeAmount}`,
        );
      }
    }
  }

  private getPositionSuffix(position: number): string {
    if (position === 1) return 'st';
    if (position === 2) return 'nd';
    if (position === 3) return 'rd';
    return 'th';
  }

  private async awardGoldenBoot(
    manager: EntityManager,
    leagueId: string,
    season: number,
  ): Promise<void> {
    const topScorer = await manager
      .getRepository(PlayerCompetitionStatsEntity)
      .findOne({
        where: { leagueId: leagueId as any, season },
        order: { goals: 'DESC', playerId: 'ASC' },
      });

    if (!topScorer || topScorer.goals === 0) return;

    // 创建事件
    await manager.getRepository(PlayerEventEntity).save(
      manager.getRepository(PlayerEventEntity).create({
        playerId: topScorer.playerId,
        season,
        date: new Date(),
        eventType: PlayerEventType.GOLDEN_BOOT,
        icon: 'emoji_events',
        titleKey: 'player_events.golden_boot',
        details: { goals: topScorer.goals, leagueId, season },
      }),
    );

    // 发放奖金给球员所在球队
    await this.addPrizeToTeam(
      manager,
      topScorer.playerId,
      PLAYER_AWARD_BONUS,
      season,
      'Golden Boot',
    );
    this.logger.info(
      `[LeagueAward] GOLDEN_BOOT: player=${topScorer.playerId} goals=${topScorer.goals}`,
    );
  }

  private async awardAssistsLeader(
    manager: EntityManager,
    leagueId: string,
    season: number,
  ): Promise<void> {
    const topAssister = await manager
      .getRepository(PlayerCompetitionStatsEntity)
      .findOne({
        where: { leagueId: leagueId as any, season },
        order: { assists: 'DESC', playerId: 'ASC' },
      });

    if (!topAssister || topAssister.assists === 0) return;

    await manager.getRepository(PlayerEventEntity).save(
      manager.getRepository(PlayerEventEntity).create({
        playerId: topAssister.playerId,
        season,
        date: new Date(),
        eventType: PlayerEventType.ASSISTS_LEADER,
        icon: 'assistant',
        titleKey: 'player_events.assists_leader',
        details: { assists: topAssister.assists, leagueId, season },
      }),
    );

    await this.addPrizeToTeam(
      manager,
      topAssister.playerId,
      PLAYER_AWARD_BONUS,
      season,
      'Assists Leader',
    );
    this.logger.info(
      `[LeagueAward] ASSISTS_LEADER: player=${topAssister.playerId} assists=${topAssister.assists}`,
    );
  }

  private async awardTacklesLeader(
    manager: EntityManager,
    leagueId: string,
    season: number,
  ): Promise<void> {
    const topTackler = await manager
      .getRepository(PlayerCompetitionStatsEntity)
      .findOne({
        where: { leagueId: leagueId as any, season },
        order: { tackles: 'DESC', playerId: 'ASC' },
      });

    if (!topTackler || topTackler.tackles === 0) return;

    await manager.getRepository(PlayerEventEntity).save(
      manager.getRepository(PlayerEventEntity).create({
        playerId: topTackler.playerId,
        season,
        date: new Date(),
        eventType: PlayerEventType.TACKLES_LEADER,
        icon: 'shield',
        titleKey: 'player_events.tackles_leader',
        details: { tackles: topTackler.tackles, leagueId, season },
      }),
    );

    await this.addPrizeToTeam(
      manager,
      topTackler.playerId,
      PLAYER_AWARD_BONUS,
      season,
      'Tackles Leader',
    );
    this.logger.info(
      `[LeagueAward] TACKLES_LEADER: player=${topTackler.playerId} tackles=${topTackler.tackles}`,
    );
  }

  private async awardChampion(
    manager: EntityManager,
    leagueId: string,
    season: number,
  ): Promise<void> {
    const standingRepo = manager.getRepository(LeagueStandingEntity);
    const playerEventRepo = manager.getRepository(PlayerEventEntity);

    const champion = await standingRepo.findOne({
      where: { leagueId, season },
      order: { position: 'ASC' },
      relations: ['team'],
    });

    if (!champion) return;

    // Find all players from the champion team
    const championPlayers = await manager.getRepository(PlayerEntity).find({
      where: { teamId: champion.teamId as any },
    });

    // Create a championship event for each player on the team.
    // Batched: one INSERT rather than one round trip per player.
    if (championPlayers.length > 0) {
      await playerEventRepo.save(
        championPlayers.map((player) =>
          playerEventRepo.create({
            playerId: player.id,
            season,
            date: new Date(),
            eventType: PlayerEventType.CHAMPIONSHIP_TITLE,
            icon: 'emoji_events',
            titleKey: 'player_events.championship_title',
            details: {
              teamId: champion.teamId,
              teamName: champion.team?.name,
              leagueId,
              season,
              position: champion.position,
            },
          }),
        ),
      );
    }

    this.logger.info(
      `[LeagueAward] CHAMPIONSHIP: team=${champion.teamId} position=${champion.position} players=${championPlayers.length}`,
    );
  }

  /**
   * Credit a player's current club (golden boot / assists / tackles).
   *
   * ## Why this writes a ledger row
   *
   * This used to be a bare `finance.balance += amount` with NO
   * `TransactionEntity`. That made the money unaccounted-for:
   *
   *  - invisible in the finance history, so a manager looking at their
   *    ledger sees their balance jump with no matching entry;
   *  - absent from `SeasonArchiveService.archiveTransactions`, which
   *    reads `transaction` — so the £100k never reached
   *    `archived_transaction` either, and the archived books did not
   *    reconcile with the live balance.
   *
   * £100k x 3 awards x 85 leagues per season was simply created from
   * nothing. The sibling `awardPrizeMoney` path DOES write a ledger row,
   * so the two were inconsistent.
   *
   * The balance update and the ledger insert share one transaction, so
   * a crash can't leave money credited with no record (or vice versa).
   */
  private async addPrizeToTeam(
    manager: EntityManager,
    playerId: number,
    amount: number,
    season: number,
    reason: string,
  ): Promise<void> {
    // 查找球员当前所在球队
    const player = await manager.getRepository(PlayerEntity).findOne({
      where: { id: playerId as any },
    });

    if (!player?.teamId) return;

    const teamId = player.teamId;

    // Re-read the balance under a write lock. The five award paths run
    // sequentially inside one transaction, and two of them can credit
    // the same club (a golden-boot winner who also won assists, say) —
    // without the lock the second increment would be computed from a
    // stale read.
    //
    // This no longer opens its own `dataSource.transaction`. It used to,
    // which was a latent bug: a nested `transaction()` call gets a
    // DIFFERENT connection, so the "transaction" was not part of the
    // caller's and its commit was independent. Now the caller owns the
    // boundary and this method participates in it.
    const finance = await manager.getRepository(FinanceEntity).findOne({
      where: { teamId: teamId as any },
      lock: { mode: 'pessimistic_write' },
    });

    if (!finance) {
      this.logger.warn(
        `[LeagueAward] ${reason}: no finance row for team ${teamId}, ` +
          `£${amount} not credited`,
      );
      return;
    }

    finance.balance += amount;
    await manager.getRepository(FinanceEntity).save(finance);

    const transactionRepo = manager.getRepository(TransactionEntity);
    await transactionRepo.save(
      transactionRepo.create({
        teamId,
        amount,
        type: TransactionType.OTHER_INCOME,
        season,
        week: SEASON_END_AWARD_WEEK,
        description: `${reason} (player ${playerId})`,
      }),
    );

    this.logger.info(
      `[LeagueAward] ${reason}: credited £${amount} to team ${teamId}`,
    );
  }

  private async getCurrentSeasonAndWeek(): Promise<{
    season: number;
    week: number;
  }> {
    // Use the shared game clock, like every other settlement cron.
    //
    // This used to read `MAX(scheduled_at)` from the match table with
    // no season filter. `season-transition.service.ts` explicitly
    // documents that pattern as a fixed bug ("Previously this service
    // derived 'current week' by querying the latest match row, which
    // could disagree with the rest of the system by one full season"),
    // but this service kept it — and the `ORDER BY scheduled_at DESC`
    // had no supporting index, so it seq-scanned + top-N sorted the
    // whole match table every Sunday.
    return currentSeasonWeek(new Date(), this.gameStart);
  }

  private async areAllWeekMatchesCompleted(
    season: number,
    week: number,
  ): Promise<boolean> {
    const totalMatches = await this.matchRepo.count({
      where: { season, week, type: MatchType.LEAGUE },
    });

    if (totalMatches === 0) {
      return false;
    }

    const completedMatches = await this.matchRepo.count({
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
