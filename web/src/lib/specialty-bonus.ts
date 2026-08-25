/**
 * Format a specialty bonus for player-facing display.
 *
 * RFC 0003 / D9: the engine stores the tier-scaled final
 * multiplier as a decimal (e.g. 1.143 for a Gold AERIAL_THREAT's
 * `shot_header` hook), but **the player-facing copy must never
 * reveal the raw decimal**. This helper turns it into a localized
 * "+14% 效果" / "+14% boost" string — the only place player code
 * should read the multiplier value from.
 *
 * Why a helper instead of inline `Math.round((c.multiplier - 1) *
 * 100)` in each call site? Two reasons:
 *   1. Centralizes the policy (always show as percent, always
 *      signed, always rounded to integer). Future tweaks (e.g.
 *      "show tier color" / "show specialty name") land in one
 *      place, not 5.
 *   2. Pairs with the D9 tripwire (a `noInternalNumbers` schema
 *      flag on the help KB) — code review can grep for
 *      `c.multiplier` outside this file and reject any new
 *      direct read.
 *
 * Bonus sign convention:
 *   - multiplier > 1.0 → "+N% 效果" (boost)
 *   - multiplier < 1.0 → "−N% 效果" (reduction; shouldn't appear
 *     in current RFC 0003 scope because reduction-class hooks
 *     are not recorded, but we handle the case defensively for
 *     future expansion)
 *   - multiplier === 1.0 → "" (no effect, caller should not
 *     have called this in the first place — early-return for
 *     safety)
 *
 * The function is pure; safe to use in render paths and tests.
 */

export type SpecialtyBonusLocale = 'zh' | 'en';

const COPY: Record<SpecialtyBonusLocale, { boost: string; reduce: string }> = {
    zh: { boost: '% 效果', reduce: '% 效果降低' },
    en: { boost: '% boost', reduce: '% reduction' },
};

/**
 * Format a single contribution as a player-facing percent string.
 * Returns `null` when there's nothing to display (multiplier is
 * 1.0, undefined, or null), so the caller can short-circuit the
 * chip entirely. This keeps the "no effect → no chip" contract
 * tight at every call site.
 *
 * `null` and `undefined` both resolve to "no effect" — a stale
 * roster, a backfilled row with a missing contribution, or a
 * future schema drift shouldn't crash the sidebar. NaN / Infinity
 * (defensive — shouldn't come from the engine) also resolve to
 * `null` so the formatter never produces "−NaN% 效果降低".
 */
export function formatSpecialtyBonus(
    multiplier: number | null | undefined,
    locale: SpecialtyBonusLocale = 'zh',
): string | null {
    // `multiplier == null` narrows to `number` for TS — without it,
    // `Number.isFinite` (typed `unknown → boolean`) doesn't tighten
    // the type and the `(multiplier - 1) * 100` line below flags
    // `multiplier` as possibly undefined.
    if (multiplier == null || !Number.isFinite(multiplier)) return null;
    if (multiplier === 1.0) return null;
    const pct = Math.round((multiplier - 1) * 100);
    if (pct === 0) return null; // tiny rounding case (1.005 → 1)
    const copy = COPY[locale];
    if (pct > 0) {
        return `+${pct}${copy.boost}`;
    }
    // Negative — reduction class. Unused in RFC 0003 scope but
    // handled defensively.
    return `−${Math.abs(pct)}${copy.reduce}`;
}
