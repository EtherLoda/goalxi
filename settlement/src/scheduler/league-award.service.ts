import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  PlayerCompetitionStatsEntity,
  PlayerEventEntity,
  PlayerEventType,
  LeagueStandingEntity,
  PlayerEntity,
  TeamEntity,
  FinanceEntity,
  MatchEntity,
  MatchStatus,
  MatchType,
} from '@goalxi/database';

const AWARD_PRIZE = 200000;

@Injectable()
export class LeagueAwardService {
  private readonly logger = new Logger(LeagueAwardService.name);

  constructor(
    @InjectRepository(PlayerCompetitionStatsEntity)
    private readonly statsRepo: Repository<PlayerCompetitionStatsEntity>,
    @InjectRepository(PlayerEventEntity)
    private readonly playerEventRepo: Repository<PlayerEventEntity>,
    @InjectRepository(LeagueStandingEntity)
    private readonly standingRepo: Repository<LeagueStandingEntity>,
    @InjectRepository(PlayerEntity)
    private readonly playerRepo: Repository<PlayerEntity>,
    @InjectRepository(TeamEntity)
    private readonly teamRepo: Repository<TeamEntity>,
    @InjectRepository(FinanceEntity)
    private readonly financeRepo: Repository<FinanceEntity>,
    @InjectRepository(MatchEntity)
    private readonly matchRepo: Repository<MatchEntity>,
  ) {}

  /**
   * 每周日 00:00 检查是否需要发放赛季奖项
   * 第15周周六比赛结束后（第15周日）触发
   */
  @Cron('0 0 * * 0') // 每周日 00:00
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
      this.logger.log('[LeagueAward] Week 15 matches not yet complete');
      return;
    }

    this.logger.log(
      `[LeagueAward] Week 15 complete, processing Season ${currentSeasonWeek.season} awards...`,
    );
    await this.processSeasonAwards(currentSeasonWeek.season);
  }

  /**
   * 发放赛季末奖项（金靴、助攻王、抢断王、冠军）
   * 需在联赛最后一轮结束后调用
   */
  async processSeasonAwards(season: number): Promise<void> {
    // 获取所有联赛
    const leagues = await this.matchRepo.manager
      .createQueryBuilder(MatchEntity, 'match')
      .select('DISTINCT match.leagueId', 'leagueId')
      .getRawMany();

    for (const { leagueId } of leagues) {
      await this.processLeagueAwards(leagueId, season);
    }

    this.logger.log(`[LeagueAward] Season ${season} awards processed`);
  }

  private async processLeagueAwards(
    leagueId: string,
    season: number,
  ): Promise<void> {
    // 检查是否已发过奖（幂等）
    const existingAwards = await this.playerEventRepo.findOne({
      where: { season, eventType: PlayerEventType.CHAMPIONSHIP_TITLE },
    });
    if (existingAwards) {
      this.logger.log(
        `[LeagueAward] Awards already processed for league ${leagueId} season ${season}`,
      );
      return;
    }

    await Promise.all([
      this.awardGoldenBoot(leagueId, season),
      this.awardAssistsLeader(leagueId, season),
      this.awardTacklesLeader(leagueId, season),
      this.awardChampion(leagueId, season),
    ]);
  }

  private async awardGoldenBoot(
    leagueId: string,
    season: number,
  ): Promise<void> {
    const topScorer = await this.statsRepo.findOne({
      where: { leagueId: leagueId as any, season },
      order: { goals: 'DESC', playerId: 'ASC' },
    });

    if (!topScorer || topScorer.goals === 0) return;

    // 创建事件
    await this.playerEventRepo.save(
      this.playerEventRepo.create({
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
    await this.addPrizeToTeam(topScorer.playerId, AWARD_PRIZE);
    this.logger.log(
      `[LeagueAward] GOLDEN_BOOT: player=${topScorer.playerId} goals=${topScorer.goals}`,
    );
  }

  private async awardAssistsLeader(
    leagueId: string,
    season: number,
  ): Promise<void> {
    const topAssister = await this.statsRepo.findOne({
      where: { leagueId: leagueId as any, season },
      order: { assists: 'DESC', playerId: 'ASC' },
    });

    if (!topAssister || topAssister.assists === 0) return;

    await this.playerEventRepo.save(
      this.playerEventRepo.create({
        playerId: topAssister.playerId,
        season,
        date: new Date(),
        eventType: PlayerEventType.ASSISTS_LEADER,
        icon: 'assistant',
        titleKey: 'player_events.assists_leader',
        details: { assists: topAssister.assists, leagueId, season },
      }),
    );

    await this.addPrizeToTeam(topAssister.playerId, AWARD_PRIZE);
    this.logger.log(
      `[LeagueAward] ASSISTS_LEADER: player=${topAssister.playerId} assists=${topAssister.assists}`,
    );
  }

  private async awardTacklesLeader(
    leagueId: string,
    season: number,
  ): Promise<void> {
    const topTackler = await this.statsRepo.findOne({
      where: { leagueId: leagueId as any, season },
      order: { tackles: 'DESC', playerId: 'ASC' },
    });

    if (!topTackler || topTackler.tackles === 0) return;

    await this.playerEventRepo.save(
      this.playerEventRepo.create({
        playerId: topTackler.playerId,
        season,
        date: new Date(),
        eventType: PlayerEventType.TACKLES_LEADER,
        icon: 'shield',
        titleKey: 'player_events.tackles_leader',
        details: { tackles: topTackler.tackles, leagueId, season },
      }),
    );

    await this.addPrizeToTeam(topTackler.playerId, AWARD_PRIZE);
    this.logger.log(
      `[LeagueAward] TACKLES_LEADER: player=${topTackler.playerId} tackles=${topTackler.tackles}`,
    );
  }

  private async awardChampion(leagueId: string, season: number): Promise<void> {
    const champion = await this.standingRepo.findOne({
      where: { leagueId, season },
      order: { position: 'ASC' },
      relations: ['team'],
    });

    if (!champion) return;

    // Find all players from the champion team
    const championPlayers = await this.playerRepo.find({
      where: { teamId: champion.teamId as any },
    });

    // Create a championship event for each player on the team
    for (const player of championPlayers) {
      await this.playerEventRepo.save(
        this.playerEventRepo.create({
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
      );
    }

    // 冠军球队直接加奖金
    const finance = await this.financeRepo.findOne({
      where: { teamId: champion.teamId as any },
    });
    if (finance) {
      finance.balance += AWARD_PRIZE;
      await this.financeRepo.save(finance);
    }

    this.logger.log(
      `[LeagueAward] CHAMPIONSHIP: team=${champion.teamId} position=${champion.position}`,
    );
  }

  private async addPrizeToTeam(
    playerId: string,
    amount: number,
  ): Promise<void> {
    // 查找球员当前所在球队
    const player = await this.playerRepo.findOne({
      where: { id: playerId as any },
    });

    if (!player?.teamId) return;

    // 给球队加奖金
    const finance = await this.financeRepo.findOne({
      where: { teamId: player.teamId as any },
    });

    if (finance) {
      finance.balance += amount;
      await this.financeRepo.save(finance);
    }
  }

  private async getCurrentSeasonAndWeek(): Promise<{
    season: number;
    week: number;
  }> {
    const latestMatch = await this.matchRepo.findOne({
      where: { type: MatchType.LEAGUE },
      order: { scheduledAt: 'DESC' },
    });

    if (!latestMatch) {
      return { season: 1, week: 1 };
    }

    return { season: latestMatch.season, week: latestMatch.week };
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
