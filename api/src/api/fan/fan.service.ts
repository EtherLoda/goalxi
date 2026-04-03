import {
  FAN_BASE_GROWTH,
  FAN_BASE_LOSS,
  FAN_CAP_SMOOTHING,
  FAN_HIDDEN_CAP,
  FanEntity,
} from '@goalxi/database';
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

@Injectable()
export class FanService {
  private readonly logger = new Logger(FanService.name);

  constructor(
    @InjectRepository(FanEntity)
    private readonly fanRepository: Repository<FanEntity>,
  ) {}

  /**
   * 获取球队球迷
   */
  async getByTeamId(teamId: string): Promise<FanEntity | null> {
    return this.fanRepository.findOne({ where: { teamId } });
  }

  /**
   * 创建球迷记录
   */
  async create(teamId: string): Promise<FanEntity> {
    const existing = await this.fanRepository.findOne({ where: { teamId } });
    if (existing) {
      return existing;
    }

    const fan = this.fanRepository.create({
      teamId,
      totalFans: 10000, // 初始 10000 球迷
      fanEmotion: 50,
      recentForm: '',
    });

    await this.fanRepository.save(fan);
    this.logger.log(`Fan record created for team ${teamId}`);

    return fan;
  }

  /**
   * 计算周球迷变化
   */
  calculateWeeklyFanChange(
    currentFans: number,
    cap: number,
    morale: number,
    recentForm: string,
  ): number {
    // 上限压力系数
    const ratio = Math.min(currentFans / cap, 0.999);
    const capPressure = Math.pow(1 - ratio, FAN_CAP_SMOOTHING);

    // 士气影响: 30 -> -125, 100 -> +312
    const moraleEffect = (morale - 50) * 6.25;

    // 表现影响: W=+120, D=0, L=-100
    let performanceEffect = 0;
    for (const r of recentForm) {
      if (r === 'W') performanceEffect += 120;
      else if (r === 'L') performanceEffect -= 100;
    }

    // 总增长
    const totalGrowth = FAN_BASE_GROWTH + moraleEffect + performanceEffect;
    const netChange = Math.floor(totalGrowth * capPressure) - FAN_BASE_LOSS;

    // 超过80%上限且无胜时额外惩罚
    if (ratio > 0.8 && !recentForm.includes('W')) {
      const penalty = Math.floor(Math.abs(netChange) * 0.5);
      return netChange - penalty;
    }

    return netChange;
  }

  /**
   * 计算情绪变化（基于预期 vs 实际）
   * @param diff actualPoints - expectedPoints (约 -3 到 +3)
   * @param result W/D/L
   */
  calculateMoraleChange(diff: number, result: 'W' | 'D' | 'L'): number {
    if (result === 'W') {
      return Math.round(diff * 8.3 + 5); // 赢: +5 ~ +30
    } else if (result === 'D') {
      return Math.round(diff * 5); // 平: 无基础奖励
    } else {
      return Math.round(diff * 10); // 输: -30 ~ 0 (无基础奖励)
    }
  }

  /**
   * 获取 ELO 预期得分
   */
  getExpectedPoints(myElo: number, opponentElo: number): number {
    const expectedWinProb = 1 / (1 + Math.pow(10, (opponentElo - myElo) / 400));
    return expectedWinProb * 3; // 0-3 分
  }

  /**
   * 获取球迷情绪档次 (0-4)
   */
  getEmotionTier(fanEmotion: number): number {
    return Math.min(4, Math.floor(fanEmotion / 20));
  }

  /**
   * 更新球迷记录（周更新）
   */
  async weeklyUpdate(
    teamId: string,
    tier: number,
    promotion: boolean,
    relegation: boolean,
  ): Promise<FanEntity> {
    const fan = await this.fanRepository.findOne({ where: { teamId } });
    if (!fan) {
      return this.create(teamId);
    }

    const cap = FAN_HIDDEN_CAP[tier as keyof typeof FAN_HIDDEN_CAP] || 100_000;

    // 处理升级/降级
    if (promotion) {
      fan.totalFans = Math.floor(fan.totalFans * 1.1);
      fan.recentForm = '';
      fan.fanEmotion = Math.min(100, fan.fanEmotion + 20);
    } else if (relegation) {
      fan.totalFans = Math.floor(fan.totalFans * 0.9);
      fan.recentForm = '';
      fan.fanEmotion = Math.max(0, fan.fanEmotion - 20);
    }

    // 计算周变化
    const change = this.calculateWeeklyFanChange(
      fan.totalFans,
      cap,
      fan.fanEmotion,
      fan.recentForm,
    );
    fan.totalFans = Math.max(1000, fan.totalFans + change);

    await this.fanRepository.save(fan);
    this.logger.debug(
      `Fan weekly update for team ${teamId}: ${change >= 0 ? '+' : ''}${change}, total: ${fan.totalFans}`,
    );

    return fan;
  }

  /**
   * 更新单场比赛后的球迷士气
   */
  async updateAfterMatch(
    teamId: string,
    actualPoints: number,
    expectedPoints: number,
    result: 'W' | 'D' | 'L',
  ): Promise<FanEntity> {
    let fan = await this.fanRepository.findOne({ where: { teamId } });
    if (!fan) {
      fan = await this.create(teamId);
    }

    // 计算情绪变化
    const diff = actualPoints - expectedPoints;
    const moraleChange = this.calculateMoraleChange(diff, result);

    // 更新最近5场结果
    let recentForm = fan.recentForm || '';
    recentForm = (recentForm + result).slice(-5);

    fan.fanEmotion = Math.max(0, Math.min(100, fan.fanEmotion + moraleChange));
    fan.recentForm = recentForm;

    await this.fanRepository.save(fan);

    this.logger.debug(
      `Fan emotion update for team ${teamId}: ${result}, expected=${expectedPoints.toFixed(1)}, actual=${actualPoints}, diff=${diff.toFixed(1)}, emotionChange=${moraleChange}, newEmotion=${fan.fanEmotion}`,
    );

    return fan;
  }

  /**
   * 获取入场人数
   * S曲线中立球迷 + 主客队球迷进场
   * 总入场 = min(capacity, 中立球迷 + 主队球迷 + 客队球迷)
   */
  calculateAttendance(
    homeFans: number,
    awayFans: number,
    homeMorale: number,
    awayMorale: number,
    capacity: number,
  ): number {
    // S曲线中立球迷：球迷少时多（补新球队），球迷多时少
    const totalFans = homeFans + awayFans;
    const neutralFans = Math.floor((capacity * 0.3) / (1 + totalFans / 5000));

    // 主队球迷进场 (20%基础)
    const homeRate = 0.6 + (homeMorale / 100) * 0.4;
    const homeFansAttendance = Math.floor(homeFans * 0.2 * homeRate);

    // 客队球迷进场 (8%基础)
    const awayRate = 0.6 + (awayMorale / 100) * 0.4;
    const awayFansAttendance = Math.floor(awayFans * 0.08 * awayRate);

    // 总入场不超过容量
    return Math.min(
      capacity,
      neutralFans + homeFansAttendance + awayFansAttendance,
    );
  }
}
