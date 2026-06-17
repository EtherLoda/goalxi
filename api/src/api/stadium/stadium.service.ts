import {
  MatchEntity,
  STADIUM_COST_PER_SEAT,
  STADIUM_DEMOLISH_REFUND_RATE,
  StadiumEntity,
  TransactionType,
  Uuid,
} from '@goalxi/database';
import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FinanceService } from '../finance/finance.service';
import { BuildStadiumReqDto, ResizeStadiumReqDto } from './dto/stadium.req.dto';

/**
 * 球场摘要 — §5.3 设置页用
 * 含容量、当前赛季平均上座率、预估比赛日收入
 */
export interface StadiumSummary {
  teamId: string;
  name: string;
  capacity: number;
  isBuilt: boolean;
  currentSeasonAvgAttendance: number | null;
  estMatchdayRevenue: number;
  buildCost: number;
  demolishRefund: number;
}

@Injectable()
export class StadiumService {
  private readonly logger = new Logger(StadiumService.name);

  constructor(
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
   * §5.3 获取球场摘要（容量 + 预估收入）
   */
  async getSummary(teamId: string): Promise<StadiumSummary | null> {
    const stadium = await this.getByTeamId(teamId);
    if (!stadium) {
      return null;
    }

    // 近 4 场主场比赛平均上座率
    const { season } = await this.getCurrentSeasonAndWeek();
    const attendanceResult = await this.matchRepository
      .createQueryBuilder('match')
      .select('AVG(match.attendance)', 'avgAttendance')
      .where('match.homeTeamId = :teamId', { teamId })
      .andWhere('match.season = :season', { season })
      .andWhere('match.status = :status', { status: 'completed' })
      .getRawOne();

    const avgAttendance =
      attendanceResult?.avgAttendance != null
        ? Math.round(Number(attendanceResult.avgAttendance))
        : null;

    // 票价假设：单座均价 (capacity × 20)
    const TICKET_PRICE = 20;
    const estMatchdayRevenue =
      avgAttendance != null ? avgAttendance * TICKET_PRICE : 0;

    const buildCost = stadium.capacity * STADIUM_COST_PER_SEAT;
    const demolishRefund = Math.floor(buildCost * STADIUM_DEMOLISH_REFUND_RATE);

    return {
      teamId: stadium.teamId,
      name: stadium.name,
      capacity: stadium.capacity,
      isBuilt: stadium.isBuilt,
      currentSeasonAvgAttendance: avgAttendance,
      estMatchdayRevenue,
      buildCost,
      demolishRefund,
    };
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
   * 建造新球场（替换现有）
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

    // 计算新球场费用（无退款）
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

    this.logger.log(
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
   * 拆除球场（支出，无退款）
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

    this.logger.log(`Stadium demolished for team ${teamId}: cost=${cost}`);

    return { cost };
  }

  /**
   * 创建默认球场（5000容量）
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
