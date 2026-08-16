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
// line-up slots as numbered variants (`CBL`, `CB`, `CBR`, `CML`, ...,
// `DMFL`, `CAML`, etc.) so it can hold multiple players at the same
// family on the pitch. The simulator's `POSITION_WEIGHTS` matrix only
// knows the family-level keys (`CB`, `CM`, `DM`, `CAM`, ...). The
// mismatch silently zeroes every contribution from any numbered slot
// — verified against match `bd7bbfeb-...` (Aug 2026) where home's
// three CBs (slot keys `CBL/2/3`) all read as 0 in every lane/phase
// even though their `defending` skill was ~6–9.
//
// This map is the single source of truth for the fold. Adding a new
// slot to the editor? Add a line here. The unknown branch falls
// through to the historical behavior (return 0) and warns once per
// unique key so the operator notices a missing entry instead of
// silently shipping wrong lane-strength numbers.

const SLOT_KEY_NORMALIZER: Readonly<Record<string, string>> = Object.freeze({
  // 3-slot centre-back. The side slots (`CBL`/`CBR`) and the centre
  // slot (`CB`) all fold to the family `CB` so downstream consumers
  // keyed by family don't have to special-case left/right.
  CBL: 'CB',
  CBR: 'CB',
  // Legacy centre-defender aliases. `CD`/`CDL`/`CDR` were retired by
  // the position-fit refactor (see the POSITION_WEIGHTS export map),
  // but the lineup editor, the convex-regression / simulation-stats
  // specs, and any saved user team that predates the refactor still
  // emit these keys. Without this mapping every `CD` player reads as
  // 0 contribution in every lane/phase — that collapses centre
  // defence by ~50% and inflates the att/def ratio enough to push
  // the empirical push-success rate from ~50% to ~85%. Verified in
  // Aug 2026 (see `engine/debug-push-prob.spec.ts`).
  CD: 'CB',
  CDL: 'CB',
  CDR: 'CB',
  // 3-slot defensive midfielder. `DMFL`/`DMFR` are the side slots,
  // `DMF` is the centre; all fold to `DMF` (the canonical 3-slot
  // centre key in the position matrix).
  DMFL: 'DMF',
  DMFR: 'DMF',
  // 3-slot central midfielder.
  CML: 'CM',
  CMR: 'CM',
  // Legacy 3-slot CM centre key (lineup editor + some fixtures).
  // Folds to family `CM` so the engine doesn't drop these players'
  // contribution to 0.
  CMC: 'CM',
  // 3-slot attacking midfielder.
  CAML: 'CAM',
  CAMR: 'CAM',
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
  // Note: do NOT short-circuit on `slotKey in POSITION_WEIGHTS`. The
  // matrix now also lists numbered editor slots (`CBL`, `CM`,
  // `DMFL`, `CAMR`, ...) as direct keys, but the test contract (and
  // downstream consumers keyed by family) require the editor's
  // numbered keys to be folded to their family (`CB`, `CM`, `DM`,
  // `CAM`). Look the slot up in the normalizer first; if there's no
  // mapping, the input is already a family / bench key and we return
  // it as-is.
  const mapped = SLOT_KEY_NORMALIZER[slotKey];
  if (mapped) return mapped;
  return slotKey; // unknown / already a family key
}

export class AttributeCalculator {
  // 缓存：用 Player 对象引用做外层 key（不是 playerId），内层用
  // `${positionKey}:${lane}:${phase}`。原实现用 `${playerId}:${...}`
  // 做 key，但 spec/测试里两支球队都从 id=0 开始编号，导致 strong
  // 命中 weak 写进 cache 的值（污染所有 OVR 不对等的实测数据）。
  // 生产环境数据库里 playerId 唯一不会冲突，但为了让 spec 也能反映
  // 真实情况，改用 player 引用做 key。
  private static contributionCache = new Map<Player, Map<string, number>>();

  // 缓存：Player -> GK save rating
  private static gkCache = new Map<Player, number>();

  // Dedup warn-set: log each unknown slot key once per process so a
  // 90-min match full of badly-keyed players doesn't emit 90 * 11 logs.
  private static unknownKeyWarned = new Set<string>();

  static clearUnknownKeyWarnCache(): void {
    this.unknownKeyWarned.clear();
  }

  // 缓存键生成(内层 key,不再含 playerId)
  private static getCacheKey(
    positionKey: string,
    lane: Lane,
    phase: Phase,
  ): string {
    return `${positionKey}:${lane}:${phase}`;
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
    const cacheKey = this.getCacheKey(positionKey, lane, phase);

    // 尝试从缓存获取(player 引用做外层 key,避免 playerId 冲突)
    let playerCache = this.contributionCache.get(player);
    if (playerCache) {
      const cached = playerCache.get(cacheKey);
      if (cached !== undefined) {
        return cached;
      }
    } else {
      playerCache = new Map<string, number>();
      this.contributionCache.set(player, playerCache);
    }

    // 计算并缓存
    const score = this.calculateContributionRaw(
      player,
      positionKey,
      lane,
      phase,
    );
    playerCache.set(cacheKey, score);
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
    // Fold editor slot keys (CBL, CM, DMFL, …) to the canonical
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
    // `for...in` walks own-enumerable keys without allocating a
    // `[key, value]` pair per iteration (the legacy
    // `Object.entries(phaseWeights)` allocated ~10 pairs per
    // call, × 22 players × 9 (lane, phase) = ~2000 pair
    // allocations per match — all on the first-call cache-miss
    // path that `simulateMatch` now pre-runs upfront via
    // `preCachePlayerContributions`). `weight` is looked up by
    // key each iteration, which V8 can usually inline since the
    // shape of `phaseWeights` is a stable `Record<string, number>`.
    for (const attrName in phaseWeights) {
      const weight = (phaseWeights as Record<string, unknown>)[attrName];
      if (typeof weight !== 'number') continue;
      if (attrName === 'abilities') continue; // not a numeric attribute

      const attrValue =
        (player.attributes[attrName as keyof PlayerAttributes] as number) ?? 0;
      totalScore += attrValue * weight * injuryPenalty;
    }

    return Math.round(totalScore * 100) / 100;
  }

  /**
   * 使用缓存的贡献值（需要在缓存后调用）
   */
  static getCachedContribution(
    player: Player,
    positionKey: string,
    lane: Lane,
    phase: Phase,
  ): number {
    const cacheKey = this.getCacheKey(positionKey, lane, phase);
    const playerCache = this.contributionCache.get(player);
    return playerCache?.get(cacheKey) ?? 0;
  }

  /**
   * 计算并缓存GK评分
   */
  static calculateAndCacheGKSaveRating(player: Player): number {
    const cached = this.gkCache.get(player);
    if (cached !== undefined) {
      return cached;
    }

    const score = this.calculateGKSaveRatingRaw(player);
    this.gkCache.set(player, score);
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
  static getCachedGKSaveRating(player: Player): number {
    return this.gkCache.get(player) ?? 100; // 默认100
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
    const cacheKey = this.getCacheKey(positionKey, lane, phase);
    const playerCache = this.contributionCache.get(player);
    if (playerCache) {
      const cached = playerCache.get(cacheKey);
      if (cached !== undefined) {
        return cached;
      }
    }
    // 计算并缓存
    return this.calculateAndCacheContribution(player, positionKey, lane, phase);
  }

  /**
   * 旧方法：保持向后兼容
   */
  static calculateGKSaveRating(player: Player): number {
    const cached = this.gkCache.get(player);
    if (cached !== undefined) {
      return cached;
    }
    return this.calculateAndCacheGKSaveRating(player);
  }
}
