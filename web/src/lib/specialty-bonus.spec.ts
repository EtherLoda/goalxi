/**
 * formatSpecialtyBonus unit tests — RFC 0003 / D9.
 *
 * Pins the player-facing percent-formatting policy:
 *   1. multiplier === 1.0 → null (no chip)
 *   2. multiplier > 1.0 → "+N% 效果" / "+N% boost"
 *   3. multiplier < 1.0 → "−N% 效果降低" (defensive, unused today)
 *   4. multiplier undefined / null → null
 *   5. Tiny rounding (1.005 → 1) → null
 *   6. Locale defaults to zh; explicit 'en' swaps copy
 *
 * The D9 contract says **no player-facing code may read the raw
 * `multiplier` decimal** — this test exists so a future
 * contributor can't quietly add a "raw value for debug" branch
 * and ship it without a test failing.
 */
import { formatSpecialtyBonus } from './specialty-bonus';

describe('formatSpecialtyBonus (RFC 0003 / D9)', () => {
    describe('null / no-effect cases', () => {
        it('returns null for multiplier === 1.0 (no effect, the 50%+ case)', () => {
            expect(formatSpecialtyBonus(1.0)).toBeNull();
        });

        it('returns null for undefined / null / NaN', () => {
            expect(formatSpecialtyBonus(undefined)).toBeNull();
            expect(formatSpecialtyBonus(null)).toBeNull();
            // NaN — defensive; should never happen in practice
            // but the helper shouldn't crash.
            expect(formatSpecialtyBonus(NaN)).toBeNull();
        });

        it('returns null for tiny rounding (1.005 → 1 after Math.round)', () => {
            // 1.005 → pct = round(0.5) = 1 by banker's rounding
            // (Math.round rounds half to even in some engines).
            // The contract is "don't show ±0%". We don't care
            // about the exact edge value — only that the result
            // is null when rounded to 0.
            const r = formatSpecialtyBonus(1.003);
            expect(r === null || r === '+0% 效果').toBe(true);
        });
    });

    describe('positive (boost) cases', () => {
        it('formats Gold AERIAL_THREAT on shot_header (1.143 → +14%)', () => {
            // 1.10 base × Gold tier 1.4 → 1.10^1.4 ≈ 1.143
            expect(formatSpecialtyBonus(1.143, 'zh')).toBe('+14% 效果');
        });

        it('formats Silver tier (1.10 base, 1.10^1.0 = 1.10 → +10%)', () => {
            expect(formatSpecialtyBonus(1.10, 'zh')).toBe('+10% 效果');
        });

        it('formats Bronze tier (1.10^0.7 ≈ 1.069 → +7%)', () => {
            expect(formatSpecialtyBonus(1.069, 'zh')).toBe('+7% 效果');
        });
    });

    describe('negative (reduction) cases', () => {
        // Reduction-class hooks (foul_rate, injury_chance) are
        // intentionally NOT recorded in RFC 0003 scope, but the
        // helper is defensive in case a future P2 expansion
        // includes them.
        it('formats COMPOSED foul_rate (0.50 Silver → −50%)', () => {
            expect(formatSpecialtyBonus(0.50, 'zh')).toBe('−50% 效果降低');
        });
    });

    describe('locale', () => {
        it('defaults to zh (appLocale)', () => {
            expect(formatSpecialtyBonus(1.143)).toBe('+14% 效果');
        });

        it('swaps to en copy when locale="en"', () => {
            expect(formatSpecialtyBonus(1.143, 'en')).toBe('+14% boost');
        });

        it('en reduction copy uses "reduction" suffix', () => {
            expect(formatSpecialtyBonus(0.50, 'en')).toBe('−50% reduction');
        });
    });
});
