/**
 * Frontend mirror of `@goalxi/database` fan constants.
 *
 * Kept in sync with `libs/database/src/entities/fan.entity.ts`:
 *   - FAN_HIDDEN_CAP (per-tier)
 *   - FAN_CAP_BASE (tier > 4 default)
 *   - FAN_EMOTION_TIER_NAMES — but the BACKEND uses 5 tiers (20-pt
 *     buckets). The dashboard renders 10 tiers (10-pt buckets) for
 *     finer storytelling: the names diverge deliberately. If you ever
 *     change the backend's 5-tier set, update the `_5_TIER_*` mirror
 *     below for reference; the dashboard uses `FAN_EMOTION_TIER_NAMES`
 *     here as the source of truth.
 *
 * The backend is the source of truth for cap & emotion maths; this
 * file just lets the dashboard render labels + cap % without an extra
 * round-trip.
 */

export const FAN_HIDDEN_CAP: Record<number, number> = {
    1: 300_000, // L1
    2: 200_000, // L2
    3: 150_000, // L3
    4: 110_000, // L4
};

export const FAN_CAP_BASE = 100_000;

/** Returns the per-tier fan cap. Tiers > 4 fall through to FAN_CAP_BASE. */
export function getFanCap(tier: number | undefined | null): number {
    if (tier == null) return FAN_CAP_BASE;
    return FAN_HIDDEN_CAP[tier] ?? FAN_CAP_BASE;
}

/**
 * Fan emotion 0-100 bucketed into 10 tiers with shared boundaries:
 *   1: 0-10   2: 11-20   3: 21-30   4: 31-40   5: 41-50
 *   6: 51-60  7: 61-70   8: 71-80   9: 81-90  10: 91-100
 * "Emotion Temperature" naming: cold → warm → blazing.
 */
export type FanEmotionTier = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;

export const FAN_EMOTION_TIER_NAMES: Record<
    FanEmotionTier,
    { en: string; zh: string }
> = {
    1:  { en: 'Silent',    zh: '死寂' },
    2:  { en: 'Hollow',    zh: '空落' },
    3:  { en: 'Skeptical', zh: '狐疑' },
    4:  { en: 'Tense',     zh: '紧绷' },
    5:  { en: 'Steady',    zh: '平稳' },
    6:  { en: 'Warming',   zh: '回暖' },
    7:  { en: 'Heated',    zh: '升温' },
    8:  { en: 'Boiling',   zh: '沸腾' },
    9:  { en: 'Frenzied',  zh: '狂热' },
    10: { en: 'Inferno',   zh: '炼狱' },
};

export function getFanEmotionTier(emotion: number): FanEmotionTier {
    if (emotion <= 10) return 1;
    if (emotion <= 20) return 2;
    if (emotion <= 30) return 3;
    if (emotion <= 40) return 4;
    if (emotion <= 50) return 5;
    if (emotion <= 60) return 6;
    if (emotion <= 70) return 7;
    if (emotion <= 80) return 8;
    if (emotion <= 90) return 9;
    return 10;
}

/**
 * Material Symbols icon per tier. Picked to reinforce the temperature
 * metaphor: cold (snowflake, cloud) → neutral (balance) → hot
 * (fire, whatshot) → special (auto_awesome for the peak).
 */
export const FAN_EMOTION_TIER_ICON: Record<FanEmotionTier, string> = {
    1:  'ac_unit',
    2:  'cloud',
    3:  'help',
    4:  'bolt',
    5:  'balance',
    6:  'device_thermostat',
    7:  'local_fire_department',
    8:  'whatshot',
    9:  'local_fire_department',
    10: 'auto_awesome',
};

/**
 * Tailwind colour classes per tier. Cold end uses `error` / muted
 * greys, warm end uses `primary` (green) then `tertiary` (gold) for
 * the peak. Kept here so the colour scheme is owned by the data, not
 * sprinkled across components.
 *
 * `dot`   — colour of a filled dot in the 10-step thermometer
 * `text`  — colour of the big tier name
 * `chip`  — header chip background + border + text
 */
export type FanEmotionAccent = {
    dot: string;
    text: string;
    chip: string;
};

export const FAN_EMOTION_TIER_ACCENT: Record<FanEmotionTier, FanEmotionAccent> = {
    1:  { dot: 'bg-error',              text: 'text-error',              chip: 'bg-error/10 text-error border-error/20' },
    2:  { dot: 'bg-error/80',           text: 'text-error/80',           chip: 'bg-error/10 text-error/80 border-error/20' },
    3:  { dot: 'bg-error/60',           text: 'text-error/70',           chip: 'bg-error/10 text-error/70 border-error/20' },
    4:  { dot: 'bg-warning',            text: 'text-warning',            chip: 'bg-warning/10 text-warning border-warning/20' },
    5:  { dot: 'bg-on-surface-variant', text: 'text-on-surface-variant', chip: 'bg-white/10 text-on-surface-variant border-white/10' },
    6:  { dot: 'bg-primary/60',         text: 'text-primary/80',         chip: 'bg-primary/10 text-primary/80 border-primary/20' },
    7:  { dot: 'bg-primary',            text: 'text-primary',            chip: 'bg-primary/10 text-primary border-primary/20' },
    8:  { dot: 'bg-primary',            text: 'text-primary',            chip: 'bg-primary/10 text-primary border-primary/20' },
    9:  { dot: 'bg-tertiary',           text: 'text-tertiary',           chip: 'bg-tertiary/10 text-tertiary border-tertiary/20' },
    10: { dot: 'bg-tertiary',           text: 'text-tertiary',           chip: 'bg-tertiary/10 text-tertiary border-tertiary/20' },
};
