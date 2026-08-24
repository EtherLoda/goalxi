/**
 * Specialty v2 system — central hook table for the simulator.
 *
 * Replaces the scattered `hasAbility(player, 'XXX')` checks that used
 * to live inline in `match.engine.ts` and `Team.ts`. Every engine
 * call site that used to read v1 abilities now goes through a method
 * here, keyed by event type.
 *
 * The system is **stateless** — it's a pure-function table indexed by
 * (event, specialty) → multiplier. No mutation, no allocation. That
 * means the test can verify each cell of the table independently, and
 * future additions (new specialties, new event types) only need to
 * update this file + the constants.
 *
 * Per-player multiplier resolution follows a fixed order:
 *   1. If `player.coreSpecialty` is null/undefined → return 1.0
 *      (the 50% of players who have no specialty).
 *   2. If `coreSpecialty` is in the deprecated pool → return 1.0
 *      (legacy data, no engine effect).
 *   3. Look up the event-specific multiplier for this specialty.
 *      If the specialty doesn't define one for this event, return 1.0.
 *   4. Apply the tier multiplier: `multiplier ^ (TIER_MULT[tier] / 1.0)`
 *      — see the comment on `applyTierMultiplier` for the exponent
 *      rationale.
 *
 * The `ctx` object passed in is the engine call site's view of
 * "what's happening right now" — for example, the attack-type the
 * sequence picked, or the lane the action is on. Hooks that don't
 * care about context can ignore it.
 */
import {
  ActiveCoreSpecialty,
  TIER_MULTIPLIERS,
  isActiveSpecialty,
  isDeprecatedSpecialty,
} from '@goalxi/database';
import { Player } from '../../types/player.types';

// Re-export the types callers will need most.
export type { ActiveCoreSpecialty } from '@goalxi/database';
export type SpecialtyTier = 'GOLD' | 'SILVER' | 'BRONZE';

// ────────────────────────────────────────────────────────────────────
// Event types — every key is one engine call site
// ────────────────────────────────────────────────────────────────────

/**
 * The set of events the engine cares about. Each value matches a
 * `SpecialtySystem.<event>()` method below. Keep this list aligned
 * with the §2 entries in `docs/specialty-v2-design.md` so the
 * "what does each specialty do?" answer is always one place.
 */
export type SpecialtyEvent =
  | 'attack_lane'           // attack contribution to a lane strength
  | 'defense_lane'          // defense contribution to a lane strength
  | 'shot_header'           // multiplier on raw header shoot rating
  | 'shot_long'             // multiplier on raw long-shot shoot rating
  | 'shot_rebound'          // multiplier on raw rebound shoot rating
  | 'shot_one_on_one'       // multiplier on 1v1 shoot rating
  | 'shot_normal'           // multiplier on normal shoot rating
  | 'gk_save'               // multiplier on gkSaveRating
  | 'push_offense'          // multiplier on pushDuel attPower
  | 'push_defense'          // multiplier on pushDuel defPower
  | 'midfield_control'      // multiplier on midfieldDuel control
  | 'select_shooter'        // weight in selectShooter
  | 'select_shooter_rebound'// weight in selectShooter when shotType === REBOUND
  | 'select_shooter_counter'// weight in selectShooter during a counter phase
  | 'select_assist'         // weight in selectAssist
  | 'select_attack_type'    // weight in selectAttackType (e.g. favor DRIBBLE)
  | 'select_shot_type'      // weight in selectShotType (e.g. favor HEADER on CROSS)
  | 'foul_rate'             // multiplier on foul chance (lower = better)
  | 'injury_chance'         // multiplier on injury chance (lower = better)
  | 'late_game_mental'      // placeholder for a future "decision quality" hook — no consumer yet (v2.0 nerf removed 2026-08-17)
  | 'command_defense'       // multiplier on team defense lane strength (GK aura)
  ;

// ────────────────────────────────────────────────────────────────────
// Hook table — base effects (Silver tier) per (event, specialty)
// ────────────────────────────────────────────────────────────────────

/**
 * For each (event, specialty) pair that has an effect, the **base**
 * multiplier the specialty applies at Silver tier. Gold/Bronze tier
 * scales via `applyTierMultiplier`.
 *
 * A missing entry means "this specialty doesn't affect this event" →
 * multiplier of 1.0.
 *
 * Numbers are chosen so a Gold tier × 1.4 gives a meaningful but
 * not overwhelming boost (e.g. +20% on header shot at Silver →
 * +28% at Gold). See §1.2 of the design doc for the tier scaling.
 */
const BASE_EFFECTS: Partial<Record<SpecialtyEvent, Partial<Record<ActiveCoreSpecialty, number>>>> = {
  attack_lane: {
    SPEEDSTER: 1.10,       // pace 推力
    POACHER: 1.10,          // positioning 嗅觉
  },
  defense_lane: {
    WALL: 1.10,             // 站位硬
    SWEEPER_KEEPER: 1.05,  // 指挥防线（GK aura）
  },
  shot_header: {
    AERIAL_THREAT: 1.10,    // 头球射门
    PHYSICAL_BEAST: 1.10,   // 身体 + 头球
  },
  shot_long: {
    // (no outfield specialty directly affects long shots in v2.3;
    //  COMPOSED's late-game hook is the only "distance from goal" boost)
  },
  shot_rebound: {
    // (handled by POACHER via select_shooter_rebound, not as a shoot
    //  rating — see §2.8 in the design doc)
  },
  shot_one_on_one: {
    // (no outfield specialty; SAVING_MASTER's gkRating multiplier
    //  covers the GK side of the 1v1)
  },
  shot_normal: {
    // (no specialty directly boosts normal shots; specialty influence
    //  is via the attacker being more likely to be selected)
  },
  gk_save: {
    SAVING_MASTER: 1.10,   // 扑救 + 反应 + 1v1 全部折成 gkRating
  },
  push_offense: {
    DRIBBLER: 1.15,         // 1v1 过人
    PLAYMAKER: 1.10,        // 传球精度
    CROSSER: 1.12,          // 传中精度
  },
  push_defense: {
    TACKLER: 1.15,          // 铲断
    WALL: 1.18,             // 1v1 防守
  },
  midfield_control: {
    TACKLER: 1.20,          // 拦截
  },
  select_shooter: {
    POACHER: 1.25,          // 优先被选为射手
  },
  select_shooter_rebound: {
    POACHER: 1.25,          // 补射时优先
  },
  select_shooter_counter: {
    SPEEDSTER: 1.20,        // 反击时优先
  },
  select_assist: {
    PLAYMAKER: 1.25,        // 优先被选为助攻者
    CROSSER: 1.20,          // 传中时优先
  },
  select_attack_type: {
    DRIBBLER: 1.20,         // 倾向选 DRIBBLE
  },
  select_shot_type: {
    CROSSER: 1.20,          // CROSS 后倾向 HEADER
  },
  foul_rate: {
    TACKLER: 0.80,          // 1 - 0.20 = 0.80 (less likely to foul)
    DRIBBLER: 0.90,         // 1 - 0.10 = 0.90 (slightly less likely)
    // COMPOSED (泰山) — the "composure" specialty. COMPOSED
    // players rarely lash out: their foul rate is cut in half
    // (0.5 Silver, ~0.42 Gold, ~0.61 Bronze via applyTierMultiplier).
    // Wired into MatchEngine.resolveFoul as a player-skip: when
    // a COMPOSED player is selected to be the fouler, the
    // engine rolls `Math.random() < foulRateMultiplier`; on a
    // miss the entire resolveFoul call is a no-op (no team
    // foul counter bump, no card distribution, no set piece).
    // See docs/specialty-v2-design.md §2.9 action point 4.
    COMPOSED: 0.50,         // 1 - 0.50 = 0.50 (half as likely to foul)
  },
  injury_chance: {
    PHYSICAL_BEAST: 0.90,   // 1 - 0.10 = 0.90 (more robust)
    AERIAL_THREAT: 0.80,    // 1 - 0.20 = 0.80 (jump events specifically;
                            //  the simulator applies this only when
                            //  actionType === 'jump')
  },
  late_game_mental: {
    // v2.0 was a 0.80 lane-strength nerf in Team.updateSnapshot
    // (formula: × (1 - 0.20 × TIER_MULT[tier]) per the design
    // doc). That landed in the wrong place — the design scope
    // was "decision quality" but the engine has no decision
    // layer, so the nerf bled into attack/defense/possession
    // lane strength for every COMPOSED player in the last 10
    // minutes. Removed 2026-08-17. The action point is left
    // here as a placeholder for a future "decision-quality"
    // hook (see docs/specialty-v2-design.md §2.9 action point
    // 2). Until a real consumer exists, the helper
    // `lateGameMentalMultiplier` returns 1.0 for everyone.
    COMPOSED: 1.0,          // placeholder — no consumer yet
  },
  command_defense: {
    SWEEPER_KEEPER: 1.05,   // 全队 defense lane 加成
  },
};

// ────────────────────────────────────────────────────────────────────
// Core API
// ────────────────────────────────────────────────────────────────────

/**
 * Return the multiplier a player applies to a given event, factoring
 * in their tier. Returns 1.0 (no effect) for:
 *   - players with no specialty
 *   - players carrying a deprecated code
 *   - (event, specialty) pairs that aren't in BASE_EFFECTS
 *
 * The tier scaling is `base ^ (TIER_MULT[tier] / 1.0)`. So a base
 * of 1.15 at Gold (1.4) becomes 1.15^1.4 ≈ 1.218, and at Bronze
 * (0.7) becomes 1.15^0.7 ≈ 1.103. This compresses the spread at
 * large bases and expands it at small ones, which is what we want
 * for "Bronze is a real downgrade but not catastrophic".
 *
 * For multipliers below 1.0 (foul_rate, injury_chance, late_game)
 * the same formula applies but the interpretation flips — a smaller
 * base at higher tier means a stronger reduction.
 */
export function getEventMultiplier(
  player: Player,
  event: SpecialtyEvent,
): number {
  const code = player?.attributes?.coreSpecialty;
  const tier = player?.attributes?.coreSpecialtyTier ?? 'BRONZE';

  // No specialty → no effect.
  if (code == null) return 1.0;
  // Deprecated code → no effect (legacy data; UI renders as 灰显).
  if (isDeprecatedSpecialty(code)) return 1.0;
  // Not a valid active code → no effect.
  if (!isActiveSpecialty(code)) return 1.0;

  const base = BASE_EFFECTS[event]?.[code];
  if (base == null) return 1.0;

  return applyTierMultiplier(base, tier);
}

/**
 * Apply the tier multiplier to a base value. The exponent is
 * `TIER_MULT[tier]` (1.0 for Silver, 1.4 for Gold, 0.7 for Bronze).
 *
 *   Silver 1.10 → 1.10^1.0 = 1.10
 *   Gold   1.10 → 1.10^1.4 ≈ 1.143
 *   Bronze 1.10 → 1.10^0.7 ≈ 1.069
 *
 * Numbers < 1.0 work the same way: a 0.80 base at Gold becomes
 * 0.80^1.4 ≈ 0.745 (more reduction), at Bronze 0.80^0.7 ≈ 0.852
 * (less reduction).
 */
export function applyTierMultiplier(base: number, tier: 'GOLD' | 'SILVER' | 'BRONZE'): number {
  const exp = TIER_MULTIPLIERS[tier];
  return Math.pow(base, exp);
}

/**
 * Helper for the "weight" style hooks (selectShooter, selectAssist,
 * etc). Most call sites want a weight that's multiplied by the
 * computed value, not a base offset. We expose this so the engine
 * can use the same return value in both positions.
 */
export function getWeight(
  player: Player,
  event: SpecialtyEvent,
): number {
  return getEventMultiplier(player, event);
}

// ────────────────────────────────────────────────────────────────────
// Convenience getters (named methods for readability at call sites)
// ────────────────────────────────────────────────────────────────────

/** Multiplier on a player's `attPower` for a given lane. */
export const attackLaneMultiplier = (player: Player): number =>
  getEventMultiplier(player, 'attack_lane');

/** Multiplier on a player's `defPower` for a given lane. */
export const defenseLaneMultiplier = (player: Player): number =>
  getEventMultiplier(player, 'defense_lane');

/** Multiplier applied to a header shot's raw shoot rating. */
export const shotHeaderMultiplier = (player: Player): number =>
  getEventMultiplier(player, 'shot_header');

/** Multiplier applied to a long-shot's raw shoot rating. */
export const shotLongMultiplier = (player: Player): number =>
  getEventMultiplier(player, 'shot_long');

/** Multiplier applied to a rebound shot's raw shoot rating. */
export const shotReboundMultiplier = (player: Player): number =>
  getEventMultiplier(player, 'shot_rebound');

/** Multiplier applied to a 1v1 shoot rating. */
export const shotOneOnOneMultiplier = (player: Player): number =>
  getEventMultiplier(player, 'shot_one_on_one');

/** Multiplier applied to a normal (in-box) shoot rating. */
export const shotNormalMultiplier = (player: Player): number =>
  getEventMultiplier(player, 'shot_normal');

/** Multiplier applied to the goalkeeper's save rating. */
export const gkSaveMultiplier = (player: Player): number =>
  getEventMultiplier(player, 'gk_save');

/** Multiplier on the attacking side of a pushDuel. */
export const pushOffenseMultiplier = (player: Player): number =>
  getEventMultiplier(player, 'push_offense');

/** Multiplier on the defending side of a pushDuel. */
export const pushDefenseMultiplier = (player: Player): number =>
  getEventMultiplier(player, 'push_defense');

/** Multiplier on a player's contribution to midfield control. */
export const midfieldControlMultiplier = (player: Player): number =>
  getEventMultiplier(player, 'midfield_control');

/** Weight in selectShooter (normal phase). */
export const selectShooterWeight = (player: Player): number =>
  getEventMultiplier(player, 'select_shooter');

/** Weight in selectShooter when the shot type is REBOUND. */
export const selectShooterReboundWeight = (player: Player): number =>
  getEventMultiplier(player, 'select_shooter_rebound');

/** Weight in selectShooter when the possession is freshly won (counter). */
export const selectShooterCounterWeight = (player: Player): number =>
  getEventMultiplier(player, 'select_shooter_counter');

/** Weight in selectAssist. */
export const selectAssistWeight = (player: Player): number =>
  getEventMultiplier(player, 'select_assist');

/** Weight in selectAttackType — favors DRIBBLE if the team has DRIBBLER. */
export const selectAttackTypeWeight = (player: Player): number =>
  getEventMultiplier(player, 'select_attack_type');

/** Weight in selectShotType — favors HEADER after a CROSS. */
export const selectShotTypeWeight = (player: Player): number =>
  getEventMultiplier(player, 'select_shot_type');

/** Multiplier on the player's foul rate (lower = better citizen). */
export const foulRateMultiplier = (player: Player): number =>
  getEventMultiplier(player, 'foul_rate');

/**
 * Multiplier on the player's injury chance (lower = more robust).
 *
 * AERIAL_THREAT's injury reduction is jump-only — see
 * `docs/specialty-v2-design.md` §2.1 Hook 3. PHYSICAL_BEAST applies
 * on any actionType. The gate lives in this helper (not in the
 * `BASE_EFFECTS` table) so the table itself can stay
 * actionType-agnostic and the engine can pass the current action
 * through unchanged. If `actionType` is omitted the helper defaults
 * to "non-jump", which is the safe fallback for any caller that
 * doesn't know the action type — the AERIAL_THREAT bonus is the
 * only thing that gate affects, and it gets 1.0 in that case.
 */
export const injuryChanceMultiplier = (
  player: Player,
  actionType?: 'tackle' | 'sprint' | 'jump' | 'collision' | 'other',
): number => {
  const code = player?.attributes?.coreSpecialty;
  if (
    actionType !== 'jump' &&
    isActiveSpecialty(code) &&
    code === 'AERIAL_THREAT'
  ) {
    return 1.0;
  }
  return getEventMultiplier(player, 'injury_chance');
};

/** Multiplier on a player's composure-related decision quality in minute >= 80. */
export const lateGameMentalMultiplier = (player: Player): number =>
  getEventMultiplier(player, 'late_game_mental');

/** Team-wide defense lane multiplier for the goalkeeper's aura effect. */
export const commandDefenseMultiplier = (player: Player): number =>
  getEventMultiplier(player, 'command_defense');

// ────────────────────────────────────────────────────────────────────
// Team-level helpers — split by hook class
// ────────────────────────────────────────────────────────────────────

/**
 * Minimal player shape required by the team-level helpers. We keep
 * this as a structural type (no import from `simulation.types.ts`)
 * so the specialty system stays free of simulator internals — the
 * caller passes `team.players` directly and the structural compat
 * with `TacticalPlayer` does the rest.
 */
export interface TeamScopedPlayer {
  player: Player;
  isSentOff?: boolean;
}

/**
 * **Decision-class** team multiplier: pick one eligible player
 * weighted by their per-player multiplier on the event, return that
 * player's multiplier. The weighted pick gives the lineup real
 * composition meaning — a 2-tier mix produces a *different* number
 * from a single elite tier alone, even though both are "best
 * holder on the pitch" candidates.
 *
 * Worked examples (TACKLER on `midfield_control`, 1.20 Silver /
 * 1.40 Gold / 0.86 Bronze per BASE_EFFECTS):
 *
 *   1 × Gold        → 1.40 (always)
 *   1 × Silver      → 1.20 (always)
 *   1 × Bronze      → 0.86 (always)
 *   1 × Gold + 1 × Silver → 0.5 × 1.40 + 0.5 × 1.20 = 1.30 (expected)
 *   2 × Silver      → 1.20 (random pick of 1, identical distribution)
 *   3 × Silver      → 1.20 (random pick of 1, identical distribution)
 *   0 holders       → 1.0 (no effect, no random draw)
 *
 * Compare with the previous `teamMaxEventMultiplier` semantics:
 *   1 × Gold + 1 × Silver → 1.40 (always picked max)
 *   3 × Silver      → 1.20 (same as random)
 * The new helper is **not strictly stronger** in either direction —
 * for a Gold + Silver lineup, random pick gives 1.30 expected (less
 * than the old max of 1.40), but for a Gold + Bronze lineup, random
 * gives 1.13 expected (more than the old max of 1.40? no, 0.86 + 1.40
 * averaged by 50% = 1.13, less than max). The semantic shift is
 * "lineup diversity now matters as much as tier max".
 *
 * Note: this helper does NOT consult a cache. The previous
 * `teamMaxEventCached` memoized the result across calls within a
 * single `simulateKeyMoment` invocation. The new helper is
 * deterministic per call (the random draw is the only nondeterminism)
 * so call sites that want determinism should pass a seeded `rand`.
 * Match-level cache loss is acceptable because the new helper is
 * O(N) over ~11 players — same cost as the max scan it replaces.
 */
export function teamSampledEventMultiplier(
  players: readonly TeamScopedPlayer[],
  event: SpecialtyEvent,
  rand: () => number = Math.random,
): number {
  // Build the eligible holder set in a single pass — no allocation
  // beyond the local array (the input array is the only allocation
  // and the caller passes `team.players` directly). The skip rules
  // mirror `getEventMultiplier`: only players whose multiplier is
  // ≠ 1.0 contribute, otherwise 1.0 is returned unchanged.
  const eligible: { weight: number; mult: number }[] = [];
  for (const p of players) {
    if (p.isSentOff) continue;
    const mult = getEventMultiplier(p.player, event);
    if (mult === 1.0) continue;
    eligible.push({ weight: mult, mult });
  }
  if (eligible.length === 0) return 1.0;

  // Weighted pick by per-player multiplier. Using the multiplier
  // itself as the weight (rather than e.g. tier) means a Gold
  // holder is 1.4× more likely to be picked than a Silver holder,
  // matching the "this holder contributes more" intuition. A
  // single-holder lineup is a degenerate case where the pick is
  // forced and the multiplier is returned unchanged.
  const totalWeight = eligible.reduce((s, e) => s + e.weight, 0);
  let r = rand() * totalWeight;
  for (const e of eligible) {
    r -= e.weight;
    if (r <= 0) return e.mult;
  }
  // Float drift fallback — the only way to reach here is if the
  // accumulated subtraction under-shot by < 1 ULP. Returning the
  // last holder's multiplier preserves the weighted-pick semantics
  // (its weight was subtracted last in the loop above).
  return eligible[eligible.length - 1].mult;
}

/**
 * **Strength-class** team multiplier: product of every eligible
 * holder's per-player multiplier, capped at `cap` to keep deep
 * lineups from over-scaling. This is the right shape for hooks
 * that "everyone contributes a bit" — defending-side push duels,
 * auras, etc. — as opposed to decision-class hooks where picking
 * one player is the natural model.
 *
 * Worked examples (TACKLER on `push_defense`, same per-player
 * multipliers as above, default cap 1.80):
 *
 *   0 holders       → 1.0
 *   1 × Silver      → 1.20
 *   2 × Silver      → 1.20 × 1.20 = 1.44
 *   3 × Silver      → 1.728
 *   5 × Silver      → 2.488 → cap 1.80
 *   1 × Gold        → 1.40
 *   1 × Gold + 1 × Silver → 1.40 × 1.20 = 1.68
 *   1 × Gold + 1 × Bronze → 1.40 × 0.86 = 1.204
 *
 * The default cap of 1.80 is calibrated for the `midfield_control` /
 * `push_defense` family (TACKLER base 1.20): 3 Silver holders hit
 * the cap, beyond which further lineups degrade to the cap. This
 * is intentionally permissive enough that a "depth strategy" of
 * 3-4 mid-tier TACKLERs is rewarded, but a 5-elite TACKLER lineup
 * doesn't blow up. Callers using a different base (e.g. 1.10 for
 * AERIAL_THREAT) should pass a smaller cap.
 */
export function teamProductEventMultiplier(
  players: readonly TeamScopedPlayer[],
  event: SpecialtyEvent,
  cap: number = 1.80,
): number {
  let product = 1.0;
  for (const p of players) {
    if (p.isSentOff) continue;
    const mult = getEventMultiplier(p.player, event);
    if (mult === 1.0) continue;
    product *= mult;
  }
  if (cap > 1.0 && product > cap) return cap;
  return product;
}
