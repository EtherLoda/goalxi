import {
  MatchEntity,
  MatchStatus,
  STADIUM_COST_PER_SEAT,
  STADIUM_DEMOLISH_REFUND_RATE,
  StadiumEntity,
  TransactionType,
  Uuid,
} from '@goalxi/database';
import { LOGGER_SERVICE, PinoLoggerService } from '@goalxi/logger';
import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FinanceService } from '../finance/finance.service';
import { BuildStadiumReqDto, ResizeStadiumReqDto } from './dto/stadium.req.dto';

/** 单次扩/缩座位时的最小步长 */
export const SEAT_ADJUST_STEP = 500;
/** 增量拆除返还比例(单座返还) */
export const SEAT_DEMOLISH_REFUND_RATE = 0.15;
/** 历史比赛无 attendance 时的回退填充率 */
export const DEFAULT_FILL_RATE = 0.7;

/**
 * 球场摘要 — §5.3 / Stadium 页
 *  含容量、当前赛季平均上座率、最近一场主场上座率、预估比赛日收入
 */
export interface StadiumSummary {
  teamId: string;
  name: string;
  capacity: number;
  isBuilt: boolean;
  /** 当前赛季所有已完成主场比赛的平均上座人数(可为 null) */
  currentSeasonAvgAttendance: number | null;
  /** 最近一场主场比赛的上座率(0-1),用于场馆页大数字展示 */
  lastHomeFillRate: number | null;
  /** 当前赛季比赛日预估收入 */
  estMatchdayRevenue: number;
  /** 重新建造一座同等规模球场的费用 */
  buildCost: number;
  /** 完整拆除的返还金额 */
  demolishRefund: number;
  /** 每次扩/缩 ±1 座位的单价 */
  seatAdjustCost: number;
  /** 每拆除一座座位的返还 */
  seatDemolishRefund: number;
}

export interface RecentHomeMatch {
  id: string;
  scheduledAt: Date;
  opponentName: string;
  homeScore: number | null;
  awayScore: number | null;
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
   * 获取球队球场
   */
  async getByTeamId(teamId: string): Promise<StadiumEntity | null> {
    return this.stadiumRepository.findOne({ where: { teamId } });
  }

  /**
   * §5.3 获取球场摘要(容量 + 真实平均上座率 + 最近一场 fillRate)
   */
  async getSummary(teamId: string): Promise<StadiumSummary | null> {
    const stadium = await this.getByTeamId(teamId);
    if (!stadium) {
      return null;
    }

    const { season } = await this.getCurrentSeasonAndWeek();

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

    let avgAttendance: number | null = null;
    let lastHomeFillRate: number | null = null;
    if (homeMatches.length > 0) {
      const filled = homeMatches.map((m) =>
        typeof m.attendance === 'number' && m.attendance > 0
          ? m.attendance
          : Math.floor(stadium.capacity * DEFAULT_FILL_RATE),
      );
      avgAttendance = Math.round(
        filled.reduce((a, b) => a + b, 0) / filled.length,
      );

      const last = homeMatches[0];
      const lastAttendance =
        typeof last.attendance === 'number' && last.attendance > 0
          ? last.attendance
          : Math.floor(stadium.capacity * DEFAULT_FILL_RATE);
      lastHomeFillRate = stadium.capacity
        ? Math.min(1, lastAttendance / stadium.capacity)
        : null;
    }

    // 票价假设:单座均价 TICKET_PRICE,与历史实现保持一致
    const TICKET_PRICE = 20;
    // Theoretical per-matchday revenue assuming 100% fill — the max the
    // stadium could generate at full capacity. The Stadium page and
    // construction dialog preview this number so the manager sees the
    // upside of any expansion at a glance.
    const estMatchdayRevenue = stadium.capacity * TICKET_PRICE;

    const buildCost = stadium.capacity * STADIUM_COST_PER_SEAT;
    const demolishRefund = Math.floor(buildCost * STADIUM_DEMOLISH_REFUND_RATE);

    return {
      teamId: stadium.teamId,
      name: stadium.name,
      capacity: stadium.capacity,
      isBuilt: stadium.isBuilt,
      currentSeasonAvgAttendance: avgAttendance,
      lastHomeFillRate,
      estMatchdayRevenue,
      buildCost,
      demolishRefund,
      seatAdjustCost: STADIUM_COST_PER_SEAT,
      seatDemolishRefund: Math.floor(
        STADIUM_COST_PER_SEAT * SEAT_DEMOLISH_REFUND_RATE,
      ),
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
          : Math.floor(stadium.capacity * DEFAULT_FILL_RATE);
      const fillRate = stadium.capacity
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
  async rename(teamId: string, name: string): Promise<StadiumEntity> {
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

  /**
   * §5 Stadium — 增量扩建座位
   *
   * 增加 `delta` 个座位(以 SEAT_ADJUST_STEP 为最小步长),扣费 = delta × STADIUM_COST_PER_SEAT。
   * 单次请求不能超过当前容量的 50%,避免一次性大改。
   */
  async expandSeats(
    teamId: string,
    delta: number,
  ): Promise<{ stadium: StadiumEntity; cost: number; newCapacity: number }> {
    if (!Number.isFinite(delta) || delta <= 0) {
      throw new BadRequestException('Delta must be a positive number');
    }
    if (delta % SEAT_ADJUST_STEP !== 0) {
      throw new BadRequestException(
        `Delta must be a multiple of ${SEAT_ADJUST_STEP}`,
      );
    }
    const stadium = await this.getByTeamId(teamId);
    if (!stadium) {
      throw new BadRequestException('Stadium not found');
    }
    const maxIncrement = Math.max(
      SEAT_ADJUST_STEP,
      Math.floor(stadium.capacity * 0.5),
    );
    if (delta > maxIncrement) {
      throw new BadRequestException(
        `Cannot expand more than ${maxIncrement} seats at once`,
      );
    }

    const newCapacity = stadium.capacity + delta;
    const cost = delta * STADIUM_COST_PER_SEAT;
    stadium.capacity = newCapacity;
    const saved = await this.stadiumRepository.save(stadium);

    const { season, week } = await this.getCurrentSeasonAndWeek();
    await this.financeService.processTransaction(
      teamId as Uuid,
      -cost,
      TransactionType.OTHER_EXPENSE,
      season,
      week,
      `Stadium expansion (+${delta} seats → ${newCapacity})`,
    );

    this.logger.info(
      `Stadium expanded for team ${teamId}: +${delta} seats → ${newCapacity}, cost=${cost}`,
    );

    return { stadium: saved, cost, newCapacity };
  }

  /**
   * §5 Stadium — 增量拆除座位
   *
   * 拆除 `delta` 个座位,以 SEAT_ADJUST_STEP 为最小步长。
   * 返还金额 = delta × STADIUM_COST_PER_SEAT × SEAT_DEMOLISH_REFUND_RATE。
   * 拆除后总容量不能低于 1000。
   */
  async demolishSeats(
    teamId: string,
    delta: number,
  ): Promise<{ stadium: StadiumEntity; refund: number; newCapacity: number }> {
    if (!Number.isFinite(delta) || delta <= 0) {
      throw new BadRequestException('Delta must be a positive number');
    }
    if (delta % SEAT_ADJUST_STEP !== 0) {
      throw new BadRequestException(
        `Delta must be a multiple of ${SEAT_ADJUST_STEP}`,
      );
    }
    const stadium = await this.getByTeamId(teamId);
    if (!stadium) {
      throw new BadRequestException('Stadium not found');
    }
    if (delta >= stadium.capacity) {
      throw new BadRequestException(
        'Cannot demolish more seats than the stadium holds. Use full demolish instead.',
      );
    }
    const newCapacity = stadium.capacity - delta;
    if (newCapacity < 1000) {
      throw new BadRequestException('Stadium must keep at least 1000 seats');
    }

    const refund = Math.floor(
      delta * STADIUM_COST_PER_SEAT * SEAT_DEMOLISH_REFUND_RATE,
    );
    stadium.capacity = newCapacity;
    const saved = await this.stadiumRepository.save(stadium);

    const { season, week } = await this.getCurrentSeasonAndWeek();
    await this.financeService.processTransaction(
      teamId as Uuid,
      refund,
      TransactionType.OTHER_INCOME,
      season,
      week,
      `Stadium partial demolition (-${delta} seats → ${newCapacity})`,
    );

    this.logger.info(
      `Stadium partially demolished for team ${teamId}: -${delta} seats → ${newCapacity}, refund=${refund}`,
    );

    return { stadium: saved, refund, newCapacity };
  }

  /**
   * 建造新球场(替换现有)
   */
  async build(
    teamId: string,
    dto: BuildStadiumReqDto,
  ): Promise<{ stadium: StadiumEntity; cost: number }> {
    if (dto.capacity < 1000) {
      throw new BadRequestException('Capacity must be at least 1000');
    }

    // 检查是否已有球场
    const existing = await this.stadiumRepository.findOne({
      where: { teamId },
    });

    if (existing) {
      // 删除旧球场
      await this.stadiumRepository.remove(existing);
    }

    // 计算新球场费用(无退款)
    const cost = dto.capacity * STADIUM_COST_PER_SEAT;
    const { season, week } = await this.getCurrentSeasonAndWeek();

    // 创建新球场
    const stadium = this.stadiumRepository.create({
      teamId,
      capacity: dto.capacity,
      isBuilt: true,
    });

    await this.stadiumRepository.save(stadium);

    // 记录交易
    await this.financeService.processTransaction(
      teamId as Uuid,
      -cost,
      TransactionType.OTHER_EXPENSE,
      season,
      week,
      `Stadium construction (${dto.capacity} seats)`,
    );

    this.logger.info(
      `Stadium built for team ${teamId}: capacity=${dto.capacity}, cost=${cost}`,
    );

    return { stadium, cost };
  }

  /**
   * 调整球场容量 - 不再支持，请使用新建和拆除
   * @deprecated Use build() to construct a new stadium
   */
  async resize(
    teamId: string,
    dto: ResizeStadiumReqDto,
  ): Promise<{ stadium: StadiumEntity; cost: number }> {
    throw new BadRequestException(
      'Stadium resize is no longer supported. Use build() to construct a new stadium.',
    );
  }

  /**
   * 拆除球场(支出，无退款)
   */
  async demolish(teamId: string): Promise<{ cost: number }> {
    const stadium = await this.stadiumRepository.findOne({ where: { teamId } });
    if (!stadium) {
      throw new BadRequestException('Stadium not found');
    }

    // 拆除费用 = 容量 × 单位成本
    const cost = stadium.capacity * STADIUM_COST_PER_SEAT;
    const { season, week } = await this.getCurrentSeasonAndWeek();

    await this.stadiumRepository.remove(stadium);

    // 记录交易
    await this.financeService.processTransaction(
      teamId as Uuid,
      -cost,
      TransactionType.OTHER_EXPENSE,
      season,
      week,
      `Stadium demolition (${stadium.capacity} seats)`,
    );

    this.logger.info(`Stadium demolished for team ${teamId}: cost=${cost}`);

    return { cost };
  }

  /**
   * 创建默认球场(5000容量)
   */
  async createDefault(teamId: string): Promise<StadiumEntity> {
    const existing = await this.stadiumRepository.findOne({
      where: { teamId },
    });
    if (existing) {
      return existing;
    }

    const stadium = this.stadiumRepository.create({
      teamId,
      capacity: 5000,
      isBuilt: true,
    });

    await this.stadiumRepository.save(stadium);
    return stadium;
  }
}
