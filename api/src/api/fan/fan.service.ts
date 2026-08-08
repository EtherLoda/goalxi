import { FanEntity } from '@goalxi/database';
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
   * 计算情绪变化(基于实际 vs 预期)
   *
   * `diff` is `actualPoints - expectedPoints` (range ~ −3 to +3,
   * the ELO-expected delta for a 3-point game). Each result branch
   * intentionally keeps the swing narrow: a single match should
   * move emotion by single-digit points, not by a third of the
   * 0-100 range. The ±20 swing for promotion / relegation
   * (`applyPromotionReward` / `applyRelegationReward`) is the
   * "big event" counterpart.
   *
   * Branches:
   *   - W: `+2` floor on a win, scaled by how unexpected it was
   *   - D: pure linear in `diff`, no floor
   *   - L: ceiling at 0, scaled by how unexpected the loss was
   *
   * @param diff actualPoints - expectedPoints (≈ −3 to +3)
   * @param result W/D/L
   */
  calculateMoraleChange(diff: number, result: 'W' | 'D' | 'L'): number {
    if (result === 'W') {
      // Win: +2 base, +4 per +diff point. Range ~ +2 … +14.
      return Math.round(2 + Math.max(0, diff) * 4);
    } else if (result === 'D') {
      // Draw: symmetric around 0, no floor. Range ~ −8 … +8.
      return Math.round(diff * 2.5);
    } else {
      // Loss: cap at 0, scaled by how bad the surprise was.
      // Range ~ 0 … −12.
      return Math.round(Math.min(0, diff) * 4);
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
   * 主队球迷按 20% 基础转化率进场,客队球迷按 8% 基础转化率进场,
   * 都按当前情绪 (0-100) 折算到场率,再叠加 ±5% 随机波动,
   * 总入场不超过球场容量。无中立球迷来源(历史上曾经讨论过,已删除)。
   */
  calculateAttendance(
    homeFans: number,
    awayFans: number,
    homeMorale: number,
    awayMorale: number,
    capacity: number,
  ): number {
    // 主队球迷进场 (20%基础)
    const homeRate = 0.6 + (homeMorale / 100) * 0.4;
    const homeFansAttendance = Math.floor(homeFans * 0.2 * homeRate);

    // 客队球迷进场 (8%基础)
    const awayRate = 0.6 + (awayMorale / 100) * 0.4;
    const awayFansAttendance = Math.floor(awayFans * 0.08 * awayRate);

    // 计算总入场（无中立球迷）
    const totalAttendance = homeFansAttendance + awayFansAttendance;

    // 添加随机波动 +/- 5%
    const fluctuation = 0.95 + Math.random() * 0.1; // 0.95 ~ 1.05
    const finalAttendance = Math.floor(totalAttendance * fluctuation);

    // 总入场不超过容量
    return Math.min(capacity, finalAttendance);
  }
}
