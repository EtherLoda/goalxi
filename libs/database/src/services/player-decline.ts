/**
 * Player Decline Calculator - Pure skill-decay logic for senior players
 * No database or NestJS dependencies - shareable between API and Settlement
 *
 * The decline system runs in parallel with the existing training pipeline
 * (see `training-calculator.ts` for the unrelated training model). It is
 * intentionally a separate, independent system so a future change to
 * either side does not have to reason about the other.
 *
 * ## Mental model
 * Senior players start declining at age 28. The decline rate grows
 * sub-quadratically with each year past 28 so the curve feels like
 * "slow start, then a smooth ramp, then a hard ceiling" rather than
 * "do nothing for 4 years then collapse in 2". Skill categories
 * decay at different speeds (physical first, mental last) so a
 * 34-year-old CB keeps his positioning but loses his pace — the FM
 * "old horse" feel.
 *
 * ## Formula
 *   decline_per_week(age, category) = DECLINE_BASE_RATE
 *     × (age − DECLINE_START_AGE) ^ DECLINE_CURVE_EXPONENT
 *     × DECLINE_CATEGORY_MULTIPLIER[category]
 *     × jitter
 *
 *   jitter ∈ [0.85, 1.15]  (uniform, deterministic when random is injected)
 *
 * At age 28: 0 (entry point — players do not decline until age 28).
 * Above DECLINE_SKILL_FLOOR: clamps; the floored flag is returned
 * alongside the new value so the caller can decide whether to surface
 * a "hit floor" event.
 *
 * ## Calibration (a=0.013, p=1.5, no jitter, category=physical, peak 18)
 *   age 28: 18.00  age 30: 17.20  age 32: 14.46  age 34:  9.08  ← halved+
 *   age 35:  5.00  ← skill floor (peak 18 → 5 in 7 game years)
 *
 * Why p=1.5 instead of p=2: the quadratic curve left the 28-30 window
 * almost flat (~0.2 lost) and then 32-34 with a 7-point cliff. The
 * 1.5 exponent spreads the same "halved at 34" target across the
 * six-year window with a much more uniform year-over-year feel:
 *   28→30: 0.80  (4.4%)   — now actually visible
 *   30→32: 2.75  (15.3%)
 *   32→34: 5.38  (29.9%)  — was 7.30 (40.6%) with p=2
 *   34→35: 3.88  (floor)
 *
 * The `0.013` rate was chosen so a peak-18 physical skill lands at
 * ~9.0 (just over half) at age 34 in the discrete game-time
 * simulation (16 weeks per integer game-year). Do NOT lower this
 * without re-running `player-decline.spec.ts` — the calibration
 * specs are the only thing pinning the "halved at 34" promise.
 */

import { PlayerEntity } from '../entities/player.entity';

/** First age at which any decline is applied. */
export const DECLINE_START_AGE = 28;

/**
 * Per-week decline coefficient. Tuned so a peak-18 physical skill
 * lands at ~9.0 (just over half) at age 34 with p=1.5 in discrete
 * game-time. Do NOT lower this without re-running the spec.
 */
export const DECLINE_BASE_RATE = 0.013;

/**
 * Sub-quadratic curve. p=2 (pure quadratic) was too back-loaded —
 * 28-30 lost almost nothing and 32-34 lost everything. p=1.5
 * spreads the same total decline across the 28-34 window with a
 * more uniform year-over-year feel.
 */
export const DECLINE_CURVE_EXPONENT = 1.5;

/**
 * Lower clamp on every individual skill value. A player at the
 * floor is still selectable (5 is a usable low-league number) but
 * will never drop further. Without this guard the p=1.5 curve
 * would still drive skills negative for 40+ year-olds.
 */
export const DECLINE_SKILL_FLOOR = 5;

/**
 * Per-category multiplier. Physical decays fastest (pace, strength),
 * set pieces barely move (free kicks survive age). The shape
 * mirrors real football: an aging CB keeps his positioning longer
 * than his pace.
 */
export const DECLINE_CATEGORY_MULTIPLIER: Record<string, number> = {
    physical: 1.00,
    technical: 0.70,
    mental: 0.40,
    setPieces: 0.20,
};

/**
 * One skill's before/after snapshot. The caller can use this to
 * build a "this week's change" record (we deliberately do not
 * write a `PlayerEventEntity` here — that decision was a scope
 * cut: see plan v2). The decline worker just mutates the player
 * and the existing training diff on Thursday picks the change up.
 */
export interface DeclineDelta {
    category: string;
    skillKey: string;
    before: number;
    after: number;
    floored: boolean;
}

/** Aggregate return value from `applyWeeklyDecline`. */
export interface DeclineResult {
    deltas: DeclineDelta[];
    totalLost: number;
    hitFloor: boolean;
}

/**
 * Compute the new value of a single skill after one week of decline.
 * Pure: no I/O, no mutation. The `random` injection is for tests so
 * the cumulative-loss specs are deterministic; production callers
 * omit it and fall through to `Math.random`.
 *
 * Returns `{ value, floored }` so the caller can tell the difference
 * between "decline produced a new, in-range value" and "decline
 * pushed the skill into the floor clamp".
 */
export function calculateDeclinedSkill(
    age: number,
    category: string,
    currentValue: number,
    random: () => number = Math.random,
): { value: number; floored: boolean } {
    if (age < DECLINE_START_AGE) {
        return { value: currentValue, floored: false };
    }
    const catMult = DECLINE_CATEGORY_MULTIPLIER[category] ?? 0.5;
    const baseDecline =
        DECLINE_BASE_RATE *
        Math.pow(age - DECLINE_START_AGE, DECLINE_CURVE_EXPONENT) *
        catMult;
    // jitter ∈ [0.85, 1.15] — keeps decline from being perfectly
    // uniform across an entire team in the same week.
    const jitter = 0.85 + random() * 0.30;
    const newValue = currentValue - baseDecline * jitter;
    if (newValue <= DECLINE_SKILL_FLOOR) {
        // `floored` is only set when decline *actually* pushed the
        // skill into the clamp. A skill that was already at the
        // floor and would have stayed there is not "floored" — it
        // is a no-op. The caller uses this to decide whether to
        // emit a "hit floor" event; only the first transition
        // counts.
        return { value: DECLINE_SKILL_FLOOR, floored: currentValue > DECLINE_SKILL_FLOOR };
    }
    return { value: newValue, floored: false };
}

/**
 * Walk every skill on a player and apply one week of decline.
 * Mutates `player.currentSkills` in place and returns a delta
 * summary so the caller can decide what (if anything) to persist
 * alongside the player save.
 *
 * Youth players are filtered out at the worker level — this
 * function does not check `isYouth` because the test surface
 * needs the simpler shape (a plain `PlayerEntity`-compatible
 * object with `currentSkills`).
 *
 * Skills already at the floor are passed through untouched:
 * the function returns `value: floor, floored: false` for
 * them so the delta record is empty and the worker can
 * skip the save.
 */
export function applyWeeklyDecline(
    player: PlayerEntity,
    random: () => number = Math.random,
): DeclineResult {
    const deltas: DeclineDelta[] = [];
    let totalLost = 0;
    let hitFloor = false;

    if (!player.currentSkills) {
        return { deltas, totalLost, hitFloor };
    }

    for (const [category, sub] of Object.entries(player.currentSkills)) {
        if (!sub || typeof sub !== 'object') continue;
        for (const [skillKey, before] of Object.entries(sub)) {
            if (typeof before !== 'number') continue;
            const { value: after, floored } = calculateDeclinedSkill(
                player.age,
                category,
                before,
                random,
            );
            if (after === before) continue;
            // Round to 2dp to match the existing applyWeeklyGrowth
            // convention (see `youth-progression.ts` line ~33).
            const rounded = parseFloat(after.toFixed(2));
            (sub as Record<string, number>)[skillKey] = rounded;
            deltas.push({ category, skillKey, before, after: rounded, floored });
            totalLost += before - rounded;
            if (floored) hitFloor = true;
        }
    }

    return { deltas, totalLost, hitFloor };
}
