import {
  FINANCE_CONSTANTS,
  MatchEntity,
  MatchStatus,
  SEAT_DEMOLISH_REFUND_RATE,
  STADIUM_COST_PER_SEAT,
  STADIUM_MAX_LEVEL,
  StadiumEntity,
  TeamEntity,
  TransactionType,
  Uuid,
  getTicketMultiplier,
  stadiumCapacityCap,
  stadiumUpgradeCost,
  stadiumUpgradeWeeks,
} from '@goalxi/database';
import { LOGGER_SERVICE, PinoLoggerService } from '@goalxi/logger';
import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FinanceService } from '../finance/finance.service';
import { assertTeamOwner } from './assert-team-owner';

/**
 * 球场摘要 — §5.3 / Stadium 页
 *
 * 含容量、当前赛季平均上座率、最近一场主场上座率、比赛日收入。
 *
 * 收入拆成两个数字，因为它们回答的是不同的问题：
 *   - `estMatchdayRevenue` 用**真实上座率**推算，回答「下一场大概能赚多少」；
 *   - `maxMatchdayRevenue` 假设**满座**，回答「这座球场最多能赚多少」。
 *
 * 之前只有一个数字，且是 `capacity × 票价`（按 100% 满座、忽略级别系数），
 * 于是它既不是实际收入也不是上限 —— 对一支坐不满的球队它高估，对顶级联赛
 * 球队它又因为漏掉 ×2 的级别系数而低估。
 */
export interface StadiumSummary {
  teamId: string;
  name: string;
  capacity: number;
  isBuilt: boolean;
  /** 当前赛季所有已完成主场比赛的平均上座人数(无数据时为 null) */
  currentSeasonAvgAttendance: number | null;
  /** 最近一场主场比赛的上座率(0-1),用于场馆页大数字展示 */
  lastHomeFillRate: number | null;
  /** 所在联赛级别(1 = 顶级);球队无联赛时为 null */
  tier: number | null;
  /** 单座实际票价(含联赛级别系数),比赛结算用的就是这个数 */
  ticketPrice: number;
  /** 按历史上座率推算的每场收入 */
  estMatchdayRevenue: number;
  /** 满座时的每场收入上限 */
  maxMatchdayRevenue: number;
  /** 每次扩/缩 ±1 座位的单价 */
  seatAdjustCost: number;
  /** 每拆除一座座位的返还 */
  seatDemolishRefund: number;
  /** 球场等级(1-5)。等级不产生收入,只决定容量上限 */
  level: number;
  /** 等级上限 */
  maxLevel: number;
  /** 当前等级允许的最大座位数;扩建不能超过这个数 */
  capacityCap: number;
  /** 升一级之后允许的座位数(已满级时为 null) */
  nextLevelCapacityCap: number | null;
  /** 升一级的一次性费用(已满级时为 null) */
  upgradeCost: number | null;
  /** 升一级占用的施工周数(已满级时为 null) */
  upgradeWeeks: number | null;
}

export interface RecentHomeMatch {
  id: string;
  scheduledAt: Date;
  opponentName: string;
  homeScore: number | null;
  awayScore: number | null;
  /** 真实记录的上座人数;该列在早于 attendance 迁移的比赛上为 null */
  attendance: number | null;
  capacity: number;
  fillRate: number | null;
  result: 'W' | 'D' | 'L' | null;
}

@Injectable()
export class StadiumService {
  constructor(
    @Inject(LOGGER_SERVICE)
    private readonly logger: PinoLoggerService,
    @InjectRepository(StadiumEntity)
    private readonly stadiumRepository: Repository<StadiumEntity>,
    @InjectRepository(MatchEntity)
    private readonly matchRepository: Repository<MatchEntity>,
    @InjectRepository(TeamEntity)
    private readonly teamRepository: Repository<TeamEntity>,
    private readonly financeService: FinanceService,
  ) {}

  private async getCurrentSeasonAndWeek(): Promise<{
    season: number;
    week: number;
  }> {
    const result = await this.matchRepository
      .createQueryBuilder('match')
      .select('MAX(match.season)', 'maxSeason')
      .addSelect('MAX(match.week)', 'maxWeek')
      .getRawOne();
    return {
      season: result?.maxSeason || 1,
      week: result?.maxWeek || 1,
    };
  }

  /**
   * 球队所在联赛级别。决定票价系数 —— 与 `match-completion.service.ts`
   * 结算真实门票收入时用的是同一个系数，两处必须一致。
   */
  private async getTier(teamId: string): Promise<number | null> {
    const team = await this.teamRepository.findOne({
      where: { id: teamId as Uuid },
      relations: { league: true },
    });
    return team?.league?.tier ?? null;
  }

  /**
   * 获取球队球场
   */
  async getByTeamId(teamId: string): Promise<StadiumEntity | null> {
    return this.stadiumRepository.findOne({ where: { teamId } });
  }

  /**
   * §5.3 获取球场摘要(容量 + 真实平均上座率 + 最近一场 fillRate + 收入区间)
   */
  async getSummary(teamId: string): Promise<StadiumSummary | null> {
    const stadium = await this.getByTeamId(teamId);
    if (!stadium) {
      return null;
    }

    const [{ season }, tier] = await Promise.all([
      this.getCurrentSeasonAndWeek(),
      this.getTier(teamId),
    ]);

    // 当前赛季已完成的主场比赛(最多取 30 场,够一个完整赛季)
    const homeMatches = await this.matchRepository.find({
      where: {
        homeTeamId: teamId,
        season,
        status: MatchStatus.COMPLETED,
      },
      order: { completedAt: 'DESC' },
      take: 30,
    });

    // Only real attendance counts. Matches played before the `attendance`
    // column existed have null here, and the old code filled those in with
    // `capacity × 0.7` — inventing a number that then propagated into the
    // season average (and into the revenue estimate derived from it).
    const recorded = homeMatches
      .map((m) => m.attendance)
      .filter((a): a is number => typeof a === 'number' && a > 0);

    const avgAttendance =
      recorded.length > 0
        ? Math.round(recorded.reduce((a, b) => a + b, 0) / recorded.length)
        : null;

    const lastAttendance =
      homeMatches.length > 0 ? homeMatches[0].attendance : null;
    const lastHomeFillRate =
      lastAttendance != null && stadium.capacity > 0
        ? Math.min(1, lastAttendance / stadium.capacity)
        : null;

    // Same price `match-completion.service.ts` uses to settle TICKET_INCOME:
    // base price × league-tier multiplier. Averaging it here keeps the
    // Stadium page and the actual ledger in lock-step.
    const ticketPrice = Math.round(
      FINANCE_CONSTANTS.TICKET_PRICE * (tier ? getTicketMultiplier(tier) : 1),
    );

    // A level never changes the price — it only unlocks seats, so the two
    // revenue numbers above stay pure `capacity × attendance × price`.
    const level = stadium.level ?? 1;

    return {
      teamId: stadium.teamId,
      name: stadium.name,
      capacity: stadium.capacity,
      isBuilt: stadium.isBuilt,
      currentSeasonAvgAttendance: avgAttendance,
      lastHomeFillRate,
      tier,
      ticketPrice,
      estMatchdayRevenue:
        avgAttendance != null ? Math.round(avgAttendance * ticketPrice) : 0,
      maxMatchdayRevenue: Math.round(stadium.capacity * ticketPrice),
      seatAdjustCost: STADIUM_COST_PER_SEAT,
      seatDemolishRefund: Math.floor(
        STADIUM_COST_PER_SEAT * SEAT_DEMOLISH_REFUND_RATE,
      ),
      level,
      maxLevel: STADIUM_MAX_LEVEL,
      capacityCap: stadiumCapacityCap(level),
      nextLevelCapacityCap:
        level < STADIUM_MAX_LEVEL
          ? stadiumCapacityCap(level + 1)
          : null,
      upgradeCost:
        level < STADIUM_MAX_LEVEL ? stadiumUpgradeCost(level + 1) : null,
      upgradeWeeks:
        level < STADIUM_MAX_LEVEL ? stadiumUpgradeWeeks(level + 1) : null,
    };
  }

  /**
   * 获取最近 N 场主场比赛,带 attendance 与上座率
   */
  async getRecentHomeMatches(
    teamId: string,
    limit = 6,
  ): Promise<RecentHomeMatch[]> {
    const stadium = await this.getByTeamId(teamId);
    if (!stadium) return [];

    const matches = await this.matchRepository.find({
      where: { homeTeamId: teamId, status: MatchStatus.COMPLETED },
      order: { completedAt: 'DESC' },
      take: limit,
    });

    return matches.map((m) => {
      const attendance =
        typeof m.attendance === 'number' && m.attendance > 0
          ? m.attendance
          : null;
      const fillRate =
        attendance != null && stadium.capacity > 0
          ? Math.min(1, attendance / stadium.capacity)
          : null;
      const result: 'W' | 'D' | 'L' | null =
        m.homeScore == null || m.awayScore == null
          ? null
          : m.homeScore > m.awayScore
            ? 'W'
            : m.homeScore < m.awayScore
              ? 'L'
              : 'D';
      return {
        id: m.id,
        scheduledAt: m.scheduledAt,
        opponentName: m.awayTeam?.name ?? 'TBD',
        homeScore: m.homeScore ?? null,
        awayScore: m.awayScore ?? null,
        attendance,
        capacity: stadium.capacity,
        fillRate,
        result,
      };
    });
  }

  /**
   * §5.3 重命名球场
   *
   * Writes a 0-amount audit transaction so the club audit timeline picks it up.
   * The classifier in club-audit.service.ts keys on "Stadium rename" prefix.
   */
  async rename(
    teamId: string,
    name: string,
    userId: string,
  ): Promise<StadiumEntity> {
    await assertTeamOwner(this.teamRepository, teamId, userId);

    const stadium = await this.getByTeamId(teamId);
    if (!stadium) {
      throw new BadRequestException('Stadium not found');
    }
    const oldName = stadium.name;
    stadium.name = name;
    const saved = await this.stadiumRepository.save(stadium);

    const { season, week } = await this.getCurrentSeasonAndWeek();
    await this.financeService.processTransaction(
      teamId as Uuid,
      0,
      TransactionType.OTHER_EXPENSE,
      season,
      week,
      `Stadium rename: ${oldName} → ${name}`,
    );

    return saved;
  }
}
