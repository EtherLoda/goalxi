/**
 * strength-tier.ts — lane strength (0-20) → SKILL_TIERS label + tier
 * colour + `+` modifier for half-step values.
 *
 * The engine's `formatLanes` helper (simulator/src/engine/match.engine.ts)
 * divides the per-lane accumulator (raw 0-2000 magnitude) by 100
 * and rounds to 1 decimal, so the FE consumes 0-20 floats:
 *
 *   7.0  -> L7 = "良好"        (no modifier, 0.0 remainder)
 *   7.5  -> L7 = "良好+"       (modifier, 0.5+ remainder)
 *   7.7  -> L7 = "良好+"
 *   8.0  -> L8 = "优秀"        (no modifier, exact integer)
 *   12.0 -> L12 = "顶尖"
 *   20.0 -> L20 = "化境"
 *
 * Why "lane strength" gets the SKILL_TIERS labels instead of a fresh
 * strength-tier table: the per-lane `atk` / `def` / `pos` aggregate is
 * the team's overall strength (11 players × contribution × multiplier
 * × laneMultiplier), so the same 0-20 scale that describes a single
 * player's skill describes the team's lane strength too. The
 * SKILL_TIERS 21-tier table already covers "无 / 糟糕 / ... / 化境"
 * and the `+` modifier pattern is the one stable across all 21 rungs.
 *
 * The locale string is consumed from `useLocale()` (next-intl) by
 * callers; this module is pure so the test suite can pin every
 * boundary without mounting React.
 */
import { getSkillTierLabel, type SkillTierLocale } from "./skill-tier";

/**
 * `+` modifier appended to the tier label when the value's fractional
 * part rounds up to the next half-step (>= 0.5). Identical glyph in
 * zh + en; we deliberately do NOT route it through next-intl because
 * `+` is a numeric postfix not a translatable noun.
 */
const PLUS_SUFFIX = "+";

/**
 * Map a 0-20 lane-strength float to `{ label, labelWithPlus }`.
 *
 * - `label` is the bare tier name (SKILL_TIERS index = floor(value)).
 * - `labelWithPlus` adds `+` when `value - floor(value) >= 0.5`. Exact
 *   integers always render without the suffix.
 * - Out-of-range inputs are clamped: `< 0` -> tier 0; `> 20` -> tier 20.
 * - NaN / non-finite inputs render the L0 "无 / None" label.
 */
export function laneStrengthTier(
  value: number,
  locale: SkillTierLocale,
): { label: string; labelWithPlus: string; hasPlus: boolean } {
  // Non-finite inputs (NaN) get the L0 label; +/-Infinity clamps to
  // the 0-20 endpoints so the FE never sees a missing tile.
  let clamped: number;
  if (!Number.isFinite(value)) {
    if (Number.isNaN(value)) {
      return { label: getSkillTierLabel(0, locale), labelWithPlus: getSkillTierLabel(0, locale), hasPlus: false };
    }
    clamped = value > 0 ? 20 : 0;
  } else {
    clamped = Math.max(0, Math.min(20, value));
  }
  const label = getSkillTierLabel(clamped, locale);
  const frac = clamped - Math.floor(clamped);
  const hasPlus = frac >= 0.5;
  return {
    label,
    labelWithPlus: hasPlus ? `${label}${PLUS_SUFFIX}` : label,
    hasPlus,
  };
}

/**
 * Tier colour ramp on the 0-20 scale. Four bands mirrors
 * `MatchPlayerMarker.tsx:powerColor` so the lane-strength tile and
 * the per-player power-rating chip read as the same family.
 */
export type LaneStrengthTierColor = "amber" | "green" | "blue" | "gray";

export function laneStrengthTierColor(value: number): LaneStrengthTierColor {
  if (!Number.isFinite(value)) return "gray";
  const clamped = Math.max(0, Math.min(20, value));
  if (clamped >= 16) return "amber"; // 化境 tier
  if (clamped >= 12) return "green"; // 顶尖+ tier
  if (clamped >= 8)  return "blue";  // 优秀+ tier
  return "gray";
}

export const LANE_STRENGTH_TIER_COLOR_HEX: Record<LaneStrengthTierColor, string> = {
  // Matched to the same hue family MatchPlayerMarker uses for the
  // 0-20 power rating chip (f59e0b / 22c55e / 60a5fa / 94a3b8), so a
  // player whose `sr` lives in the same 0-20 bucket as the team's
  // lane strength renders in the same accent — the user can
  // visually link the two.
  amber: "#f59e0b",
  green: "#22c55e",
  blue:  "#60a5fa",
  gray:  "#94a3b8",
};
