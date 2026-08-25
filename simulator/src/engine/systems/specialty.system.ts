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
  | 'shot_penalty'          // multiplier on penalty shoot rating (COMPOSED)
  | 'shot_fk'               // multiplier on direct free-kick shoot rating (COMPOSED)
  | 'gk_save'               // multiplier on gkSaveRating
  | 'push_offense'          // multiplier on pushDuel attPower
  | 'push_defense'          // multiplier on pushDuel defPower
  | 'midfield_control'      // multiplier on midfieldDuel control
  | 'foul_rate'             // multiplier on foul chance (lower = better)
  | 'injury_chance'         // multiplier on injury chance (lower = better)
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
    // v2.6: PHYSICAL_BEAST moved from here to `shot_normal`.
    // "野兽" 名字暗示身体野蛮,头球不是其强项;头球专精留给
    // AERIAL_THREAT(空霸)。野兽的强项改成禁区抽射(NORMAL shot)
    // — CF 在禁区里扛住后卫射门。数值不变(1.10),hook 移位。
    AERIAL_THREAT: 1.10,    // 头球射门 (头球专精)
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
    // v2.6: PHYSICAL_BEAST moved from `shot_header` here. CF 在
    // 禁区扛住后卫的"野兽"心智 — NORMAL shot 是 80% 射门
    // 类型,触发频率高(每场 5-15 次),平衡 head-ball buff 移走的
    // 损失。1.10 base,B/S/G tier-scaling 后 1.103/1.10/1.154。
    PHYSICAL_BEAST: 1.10,
  },
  gk_save: {
    SAVING_MASTER: 1.10,   // 扑救 + 反应 + 1v1 全部折成 gkRating
  },
  push_offense: {
    DRIBBLER: 1.15,         // 1v1 过人 (only fires on DRIBBLE attackType)
    PLAYMAKER: 1.10,        // 传球精度 (all pass types)
    CROSSER: 1.12,          // 传中精度 (only fires on CROSS attackType)
    PHYSICAL_BEAST: 1.15,   // 身体对抗 (any pushDuel — the gate is in `pushOffenseMultiplier`)
  },
  push_defense: {
    TACKLER: 1.15,          // 铲断
    WALL: 1.18,             // 1v1 防守
  },
  midfield_control: {
    TACKLER: 1.20,          // 拦截
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
  command_defense: {
    SWEEPER_KEEPER: 1.05,   // 全队 defense lane 加成
  },
  // v2.5: COMPOSED set-piece hooks (v2.0 promised them but the
  // BASE_EFFECTS rows were never added — they were effectively
  // dead code that `resolvePenalty` and `resolveDirectFreeKick`
  // never consumed). The numeric values match the v2 design doc
  // §2.9 Hook 1 (penalty shoot rating) and Hook 3 (direct free
  // kick shoot rating).
  shot_penalty: {
    COMPOSED: 1.15,
  },
  shot_fk: {
    COMPOSED: 1.10,
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

/**
 * Multiplier on the kicker's shoot rating during a penalty.
 * v2.5+: COMPOSED's "冷静 in the clutch" buff was promised in
 * the v2.0 design doc (§2.9 Hook 1) but the BASE_EFFECTS row was
 * never added and `resolvePenalty` never called `getEventMultiplier`.
 * Wired in v2.5 — Silver base 1.15 (Gold 1.21, Bronze 1.105).
 */
export const shotPenaltyMultiplier = (player: Player): number =>
  getEventMultiplier(player, 'shot_penalty');

/**
 * Multiplier on the kicker's shoot rating during a direct free
 * kick. v2.5+: same story as `shotPenaltyMultiplier` — v2 design
 * doc §2.9 Hook 3 promised it, v2.0 implementation never wired it.
 * Silver base 1.10 (Gold 1.14, Bronze 1.07).
 */
export const shotFkMultiplier = (player: Player): number =>
  getEventMultiplier(player, 'shot_fk');

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

/**
 * Multiplier on the attacking side of a pushDuel.
 *
 * The `attackType` parameter gates which specialties apply. The
 * `BASE_EFFECTS.push_offense` table is shared across all attack
 * types, but the engine only wants certain entries to fire on
 * certain types — the gate lives in this helper so the table
 * itself stays attackType-agnostic:
 *
 *   DRIBBLER (1.15)     → only on DRIBBLE   (1v1 take-on is the design)
 *   PLAYMAKER (1.10)    → on any pass type (covers THROUGH_PASS / SHORT_PASS / CROSS)
 *   CROSSER (1.12)      → only on CROSS    (wide delivery is the design)
 *   PHYSICAL_BEAST (1.15) → on any pushDuel (the "身体对抗" semantic
 *                            applies regardless of pass type — it's
 *                            a body contact event, not a delivery one)
 *
 * Without `attackType` the helper returns 1.0 for DRIBBLER /
 * CROSSER (the gated pair) and the actual base for PLAYMAKER /
 * PHYSICAL_BEAST. This is a safe default for any caller that
 * doesn't know the attack type — but the engine knows, so it
 * always passes the type through.
 *
 * v2.5: PLAYMAKER is now also applied to SHORT_PASS (previously
 * the engine only called this helper on THROUGH_PASS / CROSS /
 * DRIBBLE, which left SHORT_PASS — the most common pass type —
 * without any buff). The new call-site is a single
 * `pushOffenseMultiplier(passerPlayer, attackType)` that covers
 * all four pass types.
 *
 * The `attackType` parameter is a string-literal union rather than
 * a numeric enum so this helper stays free of imports from
 * `simulation.types.ts` (the specialty system is also a
 * candidate for `libs/database` extraction). The `AttackType[number]`
 * mapping is `string` at runtime in the engine, so a string-literal
 * comparison works as long as the engine passes the same names
 * (`'CROSS'`, `'SHORT_PASS'`, etc.) — verified by the
 * `pushOffenseMultiplier accepts AttackType names` test.
 */
export type PushOffenseAttackType =
  | 'CROSS'
  | 'SHORT_PASS'
  | 'THROUGH_PASS'
  | 'DRIBBLE'
  | 'LONG_SHOT';

export const pushOffenseMultiplier = (
  player: Player,
  attackType?: PushOffenseAttackType,
): number => {
  const code = player?.attributes?.coreSpecialty;
  // DRIBBLER's buff is "1v1 dribble", so it only fires on DRIBBLE.
  // CROSSER's buff is "wide delivery", so it only fires on CROSS.
  // When `attackType` is undefined the safe default is "no buff"
  // for these gated entries — a caller that doesn't know the
  // attack type shouldn't accidentally get the DRIBBLE / CROSS
  // bonus on the wrong attack type. PLAYMAKER (any pass) and
  // PHYSICAL_BEAST (any pushDuel) don't gate, so they apply
  // regardless of `attackType`.
  if (code === 'DRIBBLER' && attackType !== 'DRIBBLE') {
    return 1.0;
  }
  if (code === 'CROSSER' && attackType !== 'CROSS') {
    return 1.0;
  }
  return getEventMultiplier(player, 'push_offense');
};

/** Multiplier on the defending side of a pushDuel. */
export const pushDefenseMultiplier = (player: Player): number =>
  getEventMultiplier(player, 'push_defense');

/** Multiplier on a player's contribution to midfield control. */
export const midfieldControlMultiplier = (player: Player): number =>
  getEventMultiplier(player, 'midfield_control');

/**
 * v2.7: 7 specialty-weighted select* helpers were removed.
 * Previously they were consumed by `selectShooter`, `selectAssist`,
 * `selectAttackType`, and `selectShotType` to *steer the pick*
 * toward specialty holders (POACHER for the shooter pick, PLAYMAKER
 * for the assist pick, AERIAL_THREAT for CROSS header target,
 * etc.). That violated the user-facing principle "一视同仁 — the
 * engine shouldn't deliberately find specialty holders to
 * participate in events" (2026-08-25). The engine now picks
 * uniformly within position buckets and applies specialty effects
 * purely as *passive* multipliers on the picked player. POACHER /
 * AERIAL_THREAT / SPEEDSTER / PLAYMAKER / CROSSER / DRIBBLER all
 * still get picked "more often" in practice because their players
 * tend to have higher base attributes at those positions — the
 * natural attribute edge, not engine steering.
 *
 * Removed helpers and their events (kept here for git archaeology):
 *   - `selectShooterWeight`        (event: `select_shooter`)
 *   - `selectShooterReboundWeight` (event: `select_shooter_rebound`)
 *   - `selectShooterCounterWeight` (event: `select_shooter_counter`)
 *   - `selectShooterCrossHeaderWeight` (event: `select_shooter_cross_header`)
 *   - `selectAssistWeight`         (event: `select_assist`)
 *   - `selectAttackTypeWeight`     (event: `select_attack_type`)
 *   - `selectShotTypeWeight`       (event: `select_shot_type`)
 */

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
 * **Decision-class** team multiplier: the best single holder's
 * per-player multiplier, plus a per-holder depth bonus that
 * scales with the number of eligible holders on the pitch.
 *
 * Formula (v2.5+):
 *
 *   result = max(per-holder multipliers) × (1 + DEPTH_BONUS × (N − 1))
 *
 * where `DEPTH_BONUS = 0.05` and `N` is the count of eligible
 * holders (players whose per-player multiplier is ≠ 1.0, excluding
 * sent-off). The depth bonus is a relative percentage of `max` —
 * a 5-Silver lineup earns `max × 1.20 = 1.44`, not a flat `1.20 +
 * 0.20 = 1.40` — so the curve scales with the tier of the best
 * holder on the pitch. **No cap is applied** (per user request
 * 2026-08-24): see "Known trade-offs" below.
 *
 * Worked examples (TACKLER on `midfield_control`, 1.20 Silver /
 * 1.40 Gold / 0.86 Bronze per BASE_EFFECTS, tier-scaled):
 *
 *   1 × Gold          → 1.291 × 1.000 = 1.291
 *   1 × Silver        → 1.200 × 1.000 = 1.200
 *   2 × Silver        → 1.200 × 1.050 = 1.260
 *   3 × Silver        → 1.200 × 1.100 = 1.320
 *   4 × Silver        → 1.200 × 1.150 = 1.380
 *   5 × Silver        → 1.200 × 1.200 = 1.440
 *   1 × Gold + 1 × Silver  → 1.291 × 1.050 = 1.355
 *   1 × Gold + 1 × Bronze  → 1.291 × 1.050 = 1.355
 *   0 holders         → 1.0
 *
 * **Known trade-off (no cap, by user request 2026-08-24)**:
 *   3 × Silver (1.32) > 1 × Gold (1.291) — a 3-deep Silver
 *   lineup already exceeds a single Gold holder. Per the v2.0
 *   design doc, Gold is the top tier and should strictly dominate
 *   Silver; this helper currently does not enforce that. The
 *   user picked `DEPTH_BONUS = 0.05` deliberately (vs. the more
 *   conservative 0.025) so the "广撒网" path has meaningful
 *   payoff, accepting that depth > tier at the high end. If a
 *   future balance pass decides to cap the depth bonus, the
 *   natural place is a single multiplicative cap in the formula
 *   above — e.g. `min(max × (1 + DEPTH_BONUS × (N - 1)), CAP)`
 *   where `CAP` defaults to 1.50. **Do not** add the cap in this
 *   commit; the "no cap" state is intentional.
 *
 * Why not the v2.4 weighted-random pick? It degenerated to "max"
 * under all-same-tier lineups (3 × Silver always returned 1.20, same
 * as 1 × Silver), which defeated the user's "广撒网 should matter"
 * goal. The v2.5 max + depth-bonus formula gives every additional
 * holder a small but real bonus, so a 3-Silver lineup actually
 * feels different from a 1-Silver lineup.
 *
 * The `rand` parameter is preserved for backwards compatibility
 * with the v2.4 signature but is no longer consulted — the helper
 * is now deterministic per `(players, event)`. Engine call sites
 * don't pass it; the existing spec test that did is updated below.
 */
export function teamSampledEventMultiplier(
  players: readonly TeamScopedPlayer[],
  event: SpecialtyEvent,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  rand?: () => number,
): number {
  // Build the eligible holder set in a single pass — no allocation
  // beyond the local array. Skip rules mirror `getEventMultiplier`:
  // only players whose per-player multiplier is ≠ 1.0 contribute,
  // otherwise 1.0 is returned unchanged. The random-weighted pick
  // from v2.4 was removed because it degenerated to "max" under
  // all-same-tier lineups.
  const eligible: { mult: number }[] = [];
  let maxMult = 1.0;
  for (const p of players) {
    if (p.isSentOff) continue;
    const mult = getEventMultiplier(p.player, event);
    if (mult === 1.0) continue;
    eligible.push({ mult });
    if (mult > maxMult) maxMult = mult;
  }
  if (eligible.length === 0) return 1.0;

  // v2.5 depth bonus: a small per-holder reward on top of max.
  // `DEPTH_BONUS` is 5% of `max` per additional holder. The
  // multiplier is `max × (1 + DEPTH_BONUS × (N - 1))` — no cap
  // (see the docstring above for the rationale and the known
  // "3 Silver > 1 Gold" trade-off).
  const DEPTH_BONUS = 0.05;
  const depthMultiplier = 1 + DEPTH_BONUS * (eligible.length - 1);
  return maxMult * depthMultiplier;
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
