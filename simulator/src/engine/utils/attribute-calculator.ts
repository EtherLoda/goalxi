import {
  POSITION_WEIGHTS,
  PositionWeightMatrix,
  GKWeightMatrix,
} from '@goalxi/database';
import { Player, PlayerAttributes } from '../../types/player.types';
import { Lane, Phase } from '../types/simulation.types';

// ============================================================================
// Slot-key → POSITION_WEIGHTS key normalization
// ============================================================================
//
// The formation editor (`web/src/components/tactics/types.ts`) stores
// line-up slots as numbered variants (`CB1`, `CB2`, `CB3`, `CM1`, ...,
// `DMF1`, `CAM1`, etc.) so it can hold multiple players at the same
// family on the pitch. The simulator's `POSITION_WEIGHTS` matrix only
// knows the family-level keys (`CB`, `CM`, `DM`, `CAM`, ...). The
// mismatch silently zeroes every contribution from any numbered slot
// — verified against match `bd7bbfeb-...` (Aug 2026) where home's
// three CBs (slot keys `CB1/2/3`) all read as 0 in every lane/phase
// even though their `defending` skill was ~6–9.
//
// This map is the single source of truth for the fold. Adding a new
// slot to the editor? Add a line here. The unknown branch falls
// through to the historical behavior (return 0) and warns once per
// unique key so the operator notices a missing entry instead of
// silently shipping wrong lane-strength numbers.

const SLOT_KEY_NORMALIZER: Readonly<Record<string, string>> = Object.freeze({
  // Center backs — number suffix is the player-index inside the
  // formation; the family weight is the same `CB` table.
  CB1: 'CB',
  CB2: 'CB',
  CB3: 'CB',
  // Defensive midfielder family. Editor uses `DMF<n>`; the matrix
  // keys are `DM` / `CDM` (both map to the same weights).
  DMF1: 'DM',
  DMF2: 'DM',
  DMF3: 'DM',
  // Central midfielder family.
  CM1: 'CM',
  CM2: 'CM',
  CM3: 'CM',
  // Attacking midfielder family. Editor stores `CAM<n>`; the matrix
  // accepts both `AM` and `CAM` → same weights.
  CAM1: 'CAM',
  CAM2: 'CAM',
  CAM3: 'CAM',
});

/**
 * Fold a formation-editor slot key to the canonical key the engine's
 * `POSITION_WEIGHTS` matrix understands. Returns the input unchanged
 * when it's already a valid weight key.
 *
 * Pure, side-effect-free; safe to call once per snapshot-update tick
 * (called O(players) per call site).
 */
export function normalizePositionKey(slotKey: string): string {
  // Already a known key — short-circuit. The `in` check covers the
  // wholesale matrix (CF, LB, RB, LW, RW, LM, RM, AM, AML, AMR, ...) and
  // all bench keys (`BENCH_*`).
  if (slotKey in POSITION_WEIGHTS) return slotKey;
  const mapped = SLOT_KEY_NORMALIZER[slotKey];
  if (mapped) return mapped;
  return slotKey; // unknown — caller emits one warning, returns 0
}

export class AttributeCalculator {
  // 缓存：playerId + positionKey + lane + phase -> base contribution (without multiplier)
  private static contributionCache = new Map<string, number>();

  // 缓存：playerId -> GK save rating
  private static gkCache = new Map<string, number>();

  // Dedup warn-set: log each unknown slot key once per process so a
  // 90-min match full of badly-keyed players doesn't emit 90 * 11 logs.
  private static unknownKeyWarned = new Set<string>();

  static clearUnknownKeyWarnCache(): void {
    this.unknownKeyWarned.clear();
  }

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
    // Fold editor slot keys (CB1, CM2, DMF1, …) to the canonical
    // family key the weight matrix understands. See SLOT_KEY_NORMALIZER
    // for the full mapping and the rationale.
    const normalizedKey = normalizePositionKey(positionKey);
    const weights = POSITION_WEIGHTS[normalizedKey];

    if (!weights || normalizedKey === 'GK') {
      // Unknown slot key — surface to the operator once per match so
      // they notice a missing entry in SLOT_KEY_NORMALIZER. Returns 0
      // (preserves the historical behavior — never throws mid-match).
      if (
        !weights &&
        normalizedKey !== 'GK' &&
        !this.unknownKeyWarned.has(positionKey)
      ) {
        this.unknownKeyWarned.add(positionKey);
        // eslint-disable-next-line no-console
        console.warn(
          `[AttributeCalculator] Unknown positionKey '${positionKey}' — no entry in POSITION_WEIGHTS and no SLOT_KEY_NORMALIZER mapping. Player will contribute 0 to all phases. Add the mapping in simulator/src/engine/utils/attribute-calculator.ts.`,
        );
      }
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
