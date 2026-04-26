import {
  MatchEntity,
  STADIUM_COST_PER_SEAT,
  StadiumEntity,
  TransactionType,
  Uuid,
} from '@goalxi/database';
import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FinanceService } from '../finance/finance.service';
import { BuildStadiumReqDto, ResizeStadiumReqDto } from './dto/stadium.req.dto';

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
