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
   * 主队球迷按"动态转化率"进场,客队球迷按 8% 固定转化率进场,
   * 都按当前情绪 (0-100) 折算到场率,再叠加 ±5% 随机波动,
   * 总入场不超过球场容量。无中立球迷来源(历史上曾经讨论过,已删除)。
   *
   * 主队转化率从固定 0.2 改成 `0.5 - 0.3 * ratio`,其中
   * `ratio = clamp(homeFans / homeCap, 0, 1)`:
   *   - ratio=0  (球迷远低于 cap,小球队/新球队) → 50% 主场转化
   *   - ratio=1  (球迷已到 cap,顶级俱乐部)       → 20% (原值)
   *
   * 设计意图:小球队的核心支持者本来就少,这些人几乎全来现场(50%);
   * 大球队 30 万球迷中路人粉占大头,只有 20% 真的买票进场 — 这跟
   * 现实 L4 (英甲) 上座率 50%、L1 (英超) 上座率 95% 的差距是吻合的
   * (因为 L1 球场更大、票价更贵,实际到场人数看起来满但相对 fan base
   * 比例更低)。`ratio=1` 时回到原 0.2,保证对成熟生态零影响。
   *
   * 客队转化率 0.08 不动 — 客队球迷来看客场要旅行,本就更挑剔,
   * 不应该跟主队一样享"小球队红利"。
   *
   * `homeCap` 是必传参数(由调用方从 `getFanCap(tier)` 取),
   * 故意不提供 fallback:把"用什么 cap"的责任放在唯一调用方
   * `match-completion.service.ts`,避免 service 自己硬编码
   * 默认值导致行为漂移。
   */
  calculateAttendance(
    homeFans: number,
    awayFans: number,
    homeMorale: number,
    awayMorale: number,
    capacity: number,
    homeCap: number,
  ): number {
    // 主队转化率:小球队核心粉全来,大球队恢复原 0.2
    const ratio = Math.min(Math.max(homeFans / homeCap, 0), 1);
    const homeConv = 0.5 - 0.3 * ratio;

    const homeRate = 0.6 + (homeMorale / 100) * 0.4;
    const homeFansAttendance = Math.floor(homeFans * homeConv * homeRate);

    // 客队球迷进场 (8%固定,客队球迷不会享小球队红利)
    const awayRate = 0.6 + (awayMorale / 100) * 0.4;
    const awayFansAttendance = Math.floor(awayFans * 0.08 * awayRate);

    // 计算总入场(无中立球迷)
    const totalAttendance = homeFansAttendance + awayFansAttendance;

    // 添加随机波动 +/- 5%
    const fluctuation = 0.95 + Math.random() * 0.1; // 0.95 ~ 1.05
    const finalAttendance = Math.floor(totalAttendance * fluctuation);

    // 总入场不超过容量
    return Math.min(capacity, finalAttendance);
  }
}
