import {
  STADIUM_COST_PER_SEAT,
  STADIUM_DEMOLISH_REFUND_RATE,
  StadiumEntity,
} from '@goalxi/database';
import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BuildStadiumReqDto, ResizeStadiumReqDto } from './dto/stadium.req.dto';

@Injectable()
export class StadiumService {
  private readonly logger = new Logger(StadiumService.name);

  constructor(
    @InjectRepository(StadiumEntity)
    private readonly stadiumRepository: Repository<StadiumEntity>,
  ) {}

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
    let refund = 0;

    if (existing) {
      // 如果已有球场，计算拆除返还
      if (existing.isBuilt) {
        refund = Math.floor(
          existing.capacity *
            STADIUM_COST_PER_SEAT *
            STADIUM_DEMOLISH_REFUND_RATE,
        );
      }
      // 删除旧球场
      await this.stadiumRepository.remove(existing);
    }

    // 计算新球场费用
    const cost = dto.capacity * STADIUM_COST_PER_SEAT - refund;

    // 创建新球场
    const stadium = this.stadiumRepository.create({
      teamId,
      capacity: dto.capacity,
      isBuilt: true,
    });

    await this.stadiumRepository.save(stadium);
    this.logger.log(
      `Stadium built for team ${teamId}: capacity=${dto.capacity}, cost=${cost}`,
    );

    return { stadium, cost };
  }

  /**
   * 调整球场容量（增减座位）
   */
  async resize(
    teamId: string,
    dto: ResizeStadiumReqDto,
  ): Promise<{ stadium: StadiumEntity; cost: number }> {
    if (dto.capacity < 1000) {
      throw new BadRequestException('Capacity must be at least 1000');
    }

    const stadium = await this.stadiumRepository.findOne({ where: { teamId } });
    if (!stadium) {
      throw new BadRequestException('Stadium not found');
    }

    const oldCapacity = stadium.capacity;
    const capacityDiff = dto.capacity - oldCapacity;

    if (capacityDiff === 0) {
      return { stadium, cost: 0 };
    }

    let cost: number;
    if (capacityDiff > 0) {
      // 增加座位：付费
      cost = capacityDiff * STADIUM_COST_PER_SEAT;
    } else {
      // 减少座位：返还部分费用
      cost = Math.floor(
        capacityDiff * STADIUM_COST_PER_SEAT * STADIUM_DEMOLISH_REFUND_RATE,
      );
    }

    stadium.capacity = dto.capacity;
    await this.stadiumRepository.save(stadium);

    this.logger.log(
      `Stadium resized for team ${teamId}: ${oldCapacity} -> ${dto.capacity}, cost=${cost}`,
    );

    return { stadium, cost };
  }

  /**
   * 拆除球场（返还30%费用）
   */
  async demolish(teamId: string): Promise<{ refund: number }> {
    const stadium = await this.stadiumRepository.findOne({ where: { teamId } });
    if (!stadium) {
      throw new BadRequestException('Stadium not found');
    }

    // 计算返还金额
    const refund = Math.floor(
      stadium.capacity * STADIUM_COST_PER_SEAT * STADIUM_DEMOLISH_REFUND_RATE,
    );

    await this.stadiumRepository.remove(stadium);
    this.logger.log(`Stadium demolished for team ${teamId}: refund=${refund}`);

    return { refund };
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
