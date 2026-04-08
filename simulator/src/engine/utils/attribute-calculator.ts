import {
  POSITION_WEIGHTS,
  PositionWeightMatrix,
  GKWeightMatrix,
} from '@goalxi/database';
import { Player, PlayerAttributes } from '../../types/player.types';
import { Lane, Phase } from '../types/simulation.types';

export class AttributeCalculator {
  // 缓存：playerId + positionKey + lane + phase -> base contribution (without multiplier)
  private static contributionCache = new Map<string, number>();

  // 缓存：playerId -> GK save rating
  private static gkCache = new Map<string, number>();

  // 缓存键生成
  private static getCacheKey(
    playerId: string,
    positionKey: string,
    lane: Lane,
    phase: Phase,
  ): string {
    return `${playerId}:${positionKey}:${lane}:${phase}`;
  }

  /**
   * 清除所有缓存
   */
  static clearCache(): void {
    this.contributionCache.clear();
    this.gkCache.clear();
  }

  /**
   * 计算并缓存球员的基础贡献值
   */
  static calculateAndCacheContribution(
    player: Player,
    positionKey: string,
    lane: Lane,
    phase: Phase,
  ): number {
    const cacheKey = this.getCacheKey(player.id, positionKey, lane, phase);

    // 尝试从缓存获取
    const cached = this.contributionCache.get(cacheKey);
    if (cached !== undefined) {
      return cached;
    }

    // 计算并缓存
    const score = this.calculateContributionRaw(
      player,
      positionKey,
      lane,
      phase,
    );
    this.contributionCache.set(cacheKey, score);
    return score;
  }

  /**
   * 原始计算（不缓存）
   */
  private static calculateContributionRaw(
    player: Player,
    positionKey: string,
    lane: Lane,
    phase: Phase,
  ): number {
    const weights = POSITION_WEIGHTS[positionKey];

    if (!weights || positionKey === 'GK') {
      return 0;
    }

    const outfieldWeights = weights as PositionWeightMatrix;
    const laneWeights = outfieldWeights[lane];
    if (!laneWeights) return 0;

    const phaseWeights = laneWeights[phase];
    if (!phaseWeights) return 0;

    // Apply injury penalty (light injury = 0.95, heavy = 0)
    const injuryPenalty = (player as any).injuryPenalty ?? 1.0;

    let totalScore = 0;
    for (const [attrName, weight] of Object.entries(phaseWeights)) {
      if (typeof weight !== 'number') continue;
      if (attrName === 'abilities') continue; // not a numeric attribute

      const attributeName = attrName as keyof PlayerAttributes;
      const attrValue = (player.attributes[attributeName] as number) ?? 0;
      totalScore += attrValue * weight * injuryPenalty;
    }

    return parseFloat(totalScore.toFixed(2));
  }

  /**
   * 使用缓存的贡献值（需要在缓存后调用）
   */
  static getCachedContribution(
    playerId: string,
    positionKey: string,
    lane: Lane,
    phase: Phase,
  ): number {
    const cacheKey = this.getCacheKey(playerId, positionKey, lane, phase);
    return this.contributionCache.get(cacheKey) ?? 0;
  }

  /**
   * 计算并缓存GK评分
   */
  static calculateAndCacheGKSaveRating(player: Player): number {
    const cached = this.gkCache.get(player.id);
    if (cached !== undefined) {
      return cached;
    }

    const score = this.calculateGKSaveRatingRaw(player);
    this.gkCache.set(player.id, score);
    return score;
  }

  /**
   * 原始GK评分计算（不缓存）
   * GK_save_rating = reflexes * 4 + handling * 2.5 + positioning * 1.5 + aerial * 1 + composure * 1
   */
  private static calculateGKSaveRatingRaw(player: Player): number {
    const attrs = player.attributes;
    const injuryPenalty = (player as any).injuryPenalty ?? 1.0;
    const raw =
      ((attrs.gk_reflexes ?? 10) * 4 +
        (attrs.gk_handling ?? 10) * 2.5 +
        (attrs.positioning ?? 10) * 1.5 +
        (attrs.gk_aerial ?? 10) * 1 +
        (attrs.composure ?? 10) * 1) *
      injuryPenalty;
    return parseFloat((raw * 1.0).toFixed(2));
  }

  /**
   * 获取缓存的GK评分
   */
  static getCachedGKSaveRating(playerId: string): number {
    return this.gkCache.get(playerId) ?? 100; // 默认100
  }

  /**
   * 预缓存球员的所有贡献值（用于批量模拟前）
   */
  static preCachePlayerContributions(
    player: Player,
    positionKey: string,
  ): void {
    const lanes: Lane[] = ['left', 'center', 'right'];
    const phases: Phase[] = ['attack', 'possession', 'defense'];

    for (const lane of lanes) {
      for (const phase of phases) {
        this.calculateAndCacheContribution(player, positionKey, lane, phase);
      }
    }

    // GK 也缓存
    if (positionKey === 'GK') {
      this.calculateAndCacheGKSaveRating(player);
    }
  }

  /**
   * 旧方法：保持向后兼容
   */
  static calculateContribution(
    player: Player,
    positionKey: string,
    lane: Lane,
    phase: Phase,
  ): number {
    // 优先使用缓存
    const cacheKey = this.getCacheKey(player.id, positionKey, lane, phase);
    const cached = this.contributionCache.get(cacheKey);
    if (cached !== undefined) {
      return cached;
    }
    // 计算并缓存
    return this.calculateAndCacheContribution(player, positionKey, lane, phase);
  }

  /**
   * 旧方法：保持向后兼容
   */
  static calculateGKSaveRating(player: Player): number {
    const cached = this.gkCache.get(player.id);
    if (cached !== undefined) {
      return cached;
    }
    return this.calculateAndCacheGKSaveRating(player);
  }
}
