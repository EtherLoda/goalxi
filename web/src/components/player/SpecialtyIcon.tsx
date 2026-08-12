"use client";

import clsx from "clsx";
import type { ReactElement } from "react";
import { useTranslations } from "next-intl";
import { getSpecialtyFile, getSpecialtyLabel } from "@/lib/specialties";

/**
 * SpecialtyIcon — renders a v2 player specialty as an inline SVG so
 * the per-tier color (GOLD / SILVER / BRONZE) reaches the *inner*
 * shapes via `currentColor`, while the outer pentagon frame stays a
 * fixed dark color across every tier.
 *
 * Why inline SVG and not `<img src="…svg">`?
 *
 *   The previous implementation loaded each specialty as a static
 *   `<img>` and tried to drive its color via a wrapping
 *   `text-amber-300` class. But `<img>` is a replaced element — the
 *   outer `color` never reaches inside the SVG, so the
 *   `currentColor` fallbacks resolved to the browser's default
 *   (black). Every icon ended up fully black, defeating the whole
 *   tier-palette idea.
 *
 *   Inlining the SVG into React puts the icon in the same DOM as
 *   the rest of the page, so `text-amber-300` on the wrapper IS
 *   the SVG's `color`, and `currentColor` inside picks it up.
 *
 * Why a fixed-color frame?
 *
 *   v2 design intent: the pentagon reads as a neutral
 *   "specialty chip" badge, and the inner glyph carries the tier
 *   signal (gold/silver/bronze). Coloring the whole chip by tier
 *   was too loud — three bright pentagons fighting for attention
 *   on a player card. The inner glyph + 15% frame fill carry the
 *   tier cue without the visual noise.
 *
 * v1 → v2 deltas (kept from the previous file's contract):
 *   1. Tier is part of the contract — every specialty has a
 *      Gold/Silver/Bronze tier (or no specialty at all). The
 *      `tier` prop drives a per-tier text-color class on the
 *      glyph.
 *   2. Null / undefined code renders a "—" placeholder
 *      (v1 silently rendered a dot), which is the 50% of players
 *      who have no specialty under the new 5/15/30/50
 *      distribution.
 *   3. The `noSpec` mode lets the caller force the placeholder
 *      even if a code is present (e.g. when displaying a v1
 *      specialty that's been migrated to NULL).
 */
type Size = "xs" | "sm" | "md" | "lg" | "xl";
type Tier = "GOLD" | "SILVER" | "BRONZE";

const SIZE_CLASS: Record<Size, string> = {
  xs: "w-3 h-3",
  sm: "w-3.5 h-3.5",
  md: "w-4 h-4",
  lg: "w-5 h-5",
  // 36px — pairs with `text-4xl` headings on the player
  // detail page so the glyph sits visually at the same height
  // as the player's name. The pentagon frame (when enabled)
  // scales to match.
  xl: "w-9 h-9",
};

/**
 * Per-tier text-color class for the *inner* glyph. The frame uses
 * its own fixed dark color (`FRAME_TEXT`) and ignores this class.
 *
 * Tier colors are picked to read at small sizes against the dark
 * UI background:
 *   GOLD   = amber-300 (warm, premium)
 *   SILVER = slate-300 (cool, neutral)
 *   BRONZE = stone-400 (muted, baseline)
 *
 * `font-medium` tightens the SVG-to-text-color inheritance on
 * some browsers that treat SVG `color` differently from text.
 */
const TIER_TEXT: Record<Tier, string> = {
  GOLD: "text-amber-300",
  SILVER: "text-slate-300",
  BRONZE: "text-stone-400",
};

/**
 * Frame color. Fixed across every tier — see the file-level
 * comment for the design rationale. `stone-700` reads as a
 * neutral "specialty chip" outline against the dark UI
 * background without competing with the gold/silver/bronze
 * glyph inside.
 */
const FRAME_TEXT = "text-stone-700";

type Props = {
  code: string | null | undefined;
  /** v2 tier; if omitted, defaults to BRONZE (the most common case). */
  tier?: Tier;
  size?: Size;
  className?: string;
  /** Optional title for hover tooltips (defaults to `code (TIER)`). */
  title?: string;
  /**
   * Force the "no specialty" placeholder. Useful when the player
   * has been migrated to NULL but the caller still wants to surface
   * the absence visually.
   */
  noSpec?: boolean;
  /**
   * Whether to render the pentagon frame around the inner glyph.
   * Default `false` — the inner glyph alone is enough at 14-20px
   * and the chip's pill border (when present) already does the
   * "specialty badge" framing work. Set to `true` to opt back
   * into the FIFA 25-style pentagon chip for places that want the
   * more "stamped medal" look.
   */
  frame?: boolean;
  /**
   * Show a styled hover tooltip with the specialty name + tier
   * (e.g. "空霸 · 金"). Default `true` — every consumer wants
   * this; the tooltip is the only place the human-readable name
   * surfaces now that the SVG `<title>` was removed.
   *
   * The tooltip is positioned ABOVE the icon, centered, with a
   * small gap. Tier color drives the border + text; the
   * background is a dark `bg-[#001a12]/95` with backdrop-blur
   * so it stays readable over busy row backgrounds.
   *
   * Pass a label/tier override via `title` to customize the
   * first line of the tooltip (defaults to the `zh` or `en`
   * label from `getSpecialtyLabel`).
   */
  showTooltip?: boolean;
};

/**
 * Pentagon frame shared by every specialty. Stroke + 15% fill
 * match the previous SVG assets, but the colors are hard-coded
 * dark so the parent tier class never reaches them.
 */
function Frame() {
  return (
    <path
      d="M32 4 L60 24 L50 56 L14 56 L4 24 Z"
      fill="currentColor"
      fillOpacity="0.15"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinejoin="round"
    />
  );
}

/**
 * Per-specialty inner glyphs. Each entry returns only the art
 * inside the pentagon — the Frame is composed separately. Inner
 * shapes use `currentColor` so the tier class on the wrapper
 * propagates through.
 */
const GLYPHS: Record<string, () => ReactElement> = {
  // 空霸 — solid head + shoulder silhouette, ball with pentagonal
  // football pattern above, radiating impact lines.
  AERIAL_THREAT: () => (
    <g>
      <circle cx="32" cy="18" r="7" fill="none" stroke="currentColor" strokeWidth="2.5" />
      <path
        d="M32 13 L36 16 L34 21 L30 21 L28 16 Z"
        fill="currentColor"
        fillOpacity="0.45"
        stroke="currentColor"
        strokeWidth="1"
        strokeLinejoin="round"
      />
      <path d="M32 13 L32 21 M28 16 L34 21" stroke="currentColor" strokeWidth="1" opacity="0.5" />
      <path d="M22 26 L26 30" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity="0.7" />
      <path d="M42 26 L38 30" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity="0.7" />
      <path d="M18 22 L22 26" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.45" />
      <path d="M46 22 L42 26" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.45" />
      <circle cx="32" cy="42" r="7" fill="currentColor" />
      <path
        d="M22 56 L22 51 Q22 49, 24 49 L40 49 Q42 49, 42 51 L42 56 Z"
        fill="currentColor"
      />
      <path d="M14 38 L20 40" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity="0.6" />
      <path d="M50 38 L44 40" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity="0.6" />
      <path d="M12 30 L18 34" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.4" />
      <path d="M52 30 L46 34" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.4" />
    </g>
  ),

  // 盘带大师 — center ball with three motion trails to the left.
  DRIBBLER: () => (
    <g>
      <circle cx="32" cy="34" r="9" stroke="currentColor" strokeWidth="2.5" />
      <path
        d="M32 25 L36 30 L32 34 L28 30 Z M32 34 L36 38 L32 43 L28 38 Z"
        fill="currentColor"
        fillOpacity="0.3"
        stroke="currentColor"
        strokeWidth="1"
        strokeLinejoin="round"
      />
      <path d="M14 28 Q22 24, 26 30" stroke="currentColor" strokeWidth="2" strokeLinecap="round" fill="none" opacity="0.6" />
      <path d="M12 36 Q22 36, 24 36" stroke="currentColor" strokeWidth="2" strokeLinecap="round" fill="none" opacity="0.6" />
      <path d="M14 44 Q22 44, 26 38" stroke="currentColor" strokeWidth="2" strokeLinecap="round" fill="none" opacity="0.6" />
    </g>
  ),

  // 组织核心 — center ball, four-way passing arrows.
  PLAYMAKER: () => (
    <g>
      <circle cx="32" cy="32" r="7" fill="currentColor" fillOpacity="0.4" stroke="currentColor" strokeWidth="2" />
      <path
        d="M32 22 L32 14 M29 17 L32 14 L35 17"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M32 42 L32 50 M29 47 L32 50 L35 47"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M22 32 L14 32 M17 29 L14 32 L17 35"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M42 32 L50 32 M47 29 L50 32 L47 35"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="32" cy="32" r="2" fill="currentColor" />
    </g>
  ),

  // 抢断专家 — boot silhouette + studs + slide-tackle motion lines.
  TACKLER: () => (
    <g>
      <path
        d="M14 46 L20 38 Q22 36, 26 36 L36 36 Q40 36, 42 34 L46 32 L48 36 L46 42 Q44 46, 38 48 L20 48 Q14 48, 14 46 Z"
        fill="currentColor"
        fillOpacity="0.4"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path
        d="M22 50 L22 52 M28 50 L28 52 M34 50 L34 52 M40 50 L40 52"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <path
        d="M48 32 L54 28 M50 32 L54 28"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.7"
      />
      <path d="M48 38 L52 38" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity="0.5" />
    </g>
  ),

  // 铁壁 — shield + cross + impact lines.
  WALL: () => (
    <g>
      <path
        d="M32 14 L46 20 L46 34 Q46 44, 32 50 Q18 44, 18 34 L18 20 Z"
        fill="currentColor"
        fillOpacity="0.4"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
      <path
        d="M32 24 L32 40 M24 32 L40 32"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        opacity="0.8"
      />
      <path
        d="M14 18 L18 22 M16 16 L20 20"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        opacity="0.6"
      />
      <path
        d="M50 18 L46 22 M48 16 L44 20"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        opacity="0.6"
      />
    </g>
  ),

  // 闪电疾锋 — lightning bolt + speed lines.
  SPEEDSTER: () => (
    <g>
      <path
        d="M36 12 L22 34 L30 34 L24 52 L42 28 L34 28 L40 12 Z"
        fill="currentColor"
        fillOpacity="0.5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path d="M14 18 L20 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity="0.6" />
      <path d="M12 26 L18 26" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity="0.5" />
      <path d="M14 46 L20 46" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity="0.6" />
      <path d="M44 50 L50 50" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity="0.6" />
    </g>
  ),

  // 传中狂魔 — corner-flag source ball, arcing cross, target dot.
  CROSSER: () => (
    <g>
      <path
        d="M14 50 L14 44 M14 50 L20 50"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <circle cx="20" cy="46" r="5" fill="currentColor" fillOpacity="0.4" stroke="currentColor" strokeWidth="2" />
      <path
        d="M24 42 Q38 16, 48 22"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        fill="none"
      />
      <path
        d="M44 18 L48 22 L44 24"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <circle cx="48" cy="22" r="3" fill="currentColor" />
    </g>
  ),

  // 禁区之狐 — fox head with ears, eyes, nose, whiskers.
  POACHER: () => (
    <g>
      <path
        d="M22 26 L26 16 L32 22 L38 16 L42 26 Q44 36, 38 44 Q34 50, 32 50 Q30 50, 26 44 Q20 36, 22 26 Z"
        fill="currentColor"
        fillOpacity="0.4"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <circle cx="29" cy="32" r="1.5" fill="currentColor" />
      <circle cx="35" cy="32" r="1.5" fill="currentColor" />
      <path d="M32 38 L30 40 L34 40 Z" fill="currentColor" />
      <path d="M28 38 L24 39 M36 38 L40 39" stroke="currentColor" strokeWidth="1" strokeLinecap="round" opacity="0.6" />
      <path d="M26 16 L28 12 M38 16 L36 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.6" />
    </g>
  ),

  // 泰山 — mountain peaks with snow cap + sun on horizon.
  COMPOSED: () => (
    <g>
      <path
        d="M14 50 L26 28 L32 36 L40 18 L50 50 Z"
        fill="currentColor"
        fillOpacity="0.4"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path
        d="M40 18 L46 32"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        opacity="0.5"
      />
      <path
        d="M36 24 L40 18 L44 24 L42 26 L40 24 L38 26 Z"
        fill="currentColor"
        fillOpacity="0.6"
      />
      <path d="M10 50 L54 50" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.4" />
      <circle cx="14" cy="22" r="2" fill="currentColor" opacity="0.6" />
    </g>
  ),

  // 铁人 — flexed arm + fist + impact stars.
  PHYSICAL_BEAST: () => (
    <g>
      <path
        d="M16 38 a10 10 0 0 1 12 -12 L36 18 L40 22 L36 28 L28 28 L24 34 L20 38 Z"
        fill="currentColor"
        fillOpacity="0.4"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <circle cx="42" cy="20" r="5" fill="currentColor" fillOpacity="0.6" stroke="currentColor" strokeWidth="2" />
      <path
        d="M48 14 L50 12 L50 16 L48 16 Z M52 22 L54 20 L54 24 Z"
        fill="currentColor"
        opacity="0.7"
      />
      <path d="M16 38 L14 46" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </g>
  ),

  // 扑救专家 — open glove with five fingers + ball being caught +
  // reaction lines.
  SAVING_MASTER: () => (
    <g>
      <path
        d="M20 24 L20 18 Q20 14, 24 14 Q28 14, 28 18 L28 22 L32 22 Q34 22, 34 18 Q34 12, 38 12 Q42 12, 42 18 L42 22 L44 22 Q46 22, 46 26 L46 38 Q46 46, 38 50 L28 50 Q20 46, 20 38 Z"
        fill="currentColor"
        fillOpacity="0.4"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <circle cx="32" cy="32" r="6" fill="currentColor" fillOpacity="0.6" stroke="currentColor" strokeWidth="2" />
      <path d="M10 14 L16 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity="0.5" />
      <path d="M8 22 L14 24" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity="0.4" />
    </g>
  ),

  // 出击门将 — keeper silhouette lunging forward with extended leg
  // and open glove reaching for the ball.
  SWEEPER_KEEPER: () => (
    <g>
      <circle cx="20" cy="20" r="5" fill="currentColor" fillOpacity="0.5" stroke="currentColor" strokeWidth="2" />
      <path
        d="M16 26 Q20 24, 24 26 L30 36 L36 42"
        stroke="currentColor"
        strokeWidth="2"
        fill="none"
        strokeLinecap="round"
      />
      <path
        d="M30 36 L44 38 L50 32"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        fill="none"
      />
      <path
        d="M48 26 L54 22 M48 30 L56 28 M48 34 L54 34"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        opacity="0.6"
      />
      <path d="M52 18 L48 26" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity="0.5" />
    </g>
  ),
};

export function SpecialtyIcon({
  code,
  tier = "BRONZE",
  size = "md",
  className,
  title,
  noSpec,
  frame = false,
  showTooltip = true,
}: Props) {
  // i18n — read tier labels from the active locale. "specialty"
  // namespace was added in messages/{zh,en}.json alongside
  // `player_events`. Using `useTranslations` (not hardcoded
  // `tier === "GOLD" ? "金" : ...`) means the tooltip follows
  // the user's language automatically, including future locales.
  const tSpecialty = useTranslations("specialty");
  const tTier = useTranslations("specialty.tier");
  // No specialty → render the "—" placeholder. We do this even when
  // a stale code is present if the caller passes `noSpec`, so the
  // migration window can show "this player used to have a
  // deprecated specialty" without breaking the layout.
  if (noSpec || !code) {
    return (
      <span
        title={title ?? "无特技"}
        aria-label="无特技"
        className={clsx(
          "inline-flex items-center justify-center text-stone-500 opacity-60 select-none",
          size === "xs" && "text-[10px]",
          size === "sm" && "text-xs",
          size === "md" && "text-sm",
          size === "lg" && "text-base",
          className,
        )}
      >
        —
      </span>
    );
  }

  // Resolve the inner glyph. v2 active codes map directly; v1
  // legacy codes fall through to the neutral dot (a v1 code means
  // the data hasn't been migrated yet — the squad page should
  // surface that visually without breaking the layout).
  const Glyph = GLYPHS[code];
  const file = getSpecialtyFile(code);

  if (!Glyph || !file) {
    return (
      <span
        title={title ?? code}
        aria-label={code}
        className={clsx(
          "inline-block rounded-full bg-stone-500 opacity-50",
          SIZE_CLASS[size],
          className,
        )}
      />
    );
  }

  // The specialty name comes from `getSpecialtyLabel`, which
  // already speaks both `zh` and `en`. We detect the active
  // locale via `navigator.language` so the tooltip label and
  // the SVG `aria-label` line up. The tier label ("金"/"Gold"
  // etc.) comes from the i18n catalog via `tTier` above so a
  // future locale (e.g. `ja`) only needs the message file
  // updated, not this component.
  const locale =
    typeof navigator !== "undefined" &&
    navigator.language?.toLowerCase().startsWith("en")
      ? "en"
      : "zh";
  const tooltipLabel =
    title ?? getSpecialtyLabel(code, locale) ?? code;
  const tierLabel = tTier(tier);

  return (
    <span
      className={clsx(
        "group/specialty relative inline-flex items-center",
        // Inherit tier color so the tooltip border + text read in tier.
        TIER_TEXT[tier],
        className,
      )}
    >
      <svg
        viewBox="0 0 64 64"
        fill="none"
        xmlns="http://www.w3.org/200/svg"
        aria-label={code}
        role="img"
        className={clsx(
          "inline-block align-middle",
          SIZE_CLASS[size],
        )}
      >
        {frame && (
          <g className={FRAME_TEXT} aria-hidden>
            <Frame />
          </g>
        )}
        <g aria-hidden>
          <Glyph />
        </g>
      </svg>

      {/* Hover tooltip — name + tier (金/银/铜). Centered above the
          icon, dark glass background, tier-colored border. Pure CSS via
          `group/specialty` so no JS state needed; `pointer-events-none`
          so the tooltip never blocks the icon's hover target. */}
      {showTooltip && (
        <span
          aria-hidden
          className="pointer-events-none invisible opacity-0 group-hover/specialty:visible group-hover/specialty:opacity-100 group-hover/specialty:-translate-y-0.5 translate-y-1 transition-all duration-200 ease-out absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50 whitespace-nowrap bg-[#001a12]/95 border border-current rounded-lg px-2.5 py-1.5 text-xs font-bold font-space shadow-xl shadow-black/40 backdrop-blur-sm"
        >
          <span>{tooltipLabel}</span>
          <span className="mx-1.5 opacity-50">·</span>
          <span className="opacity-90">{tierLabel}</span>
          {/* Small arrow pointing down to the icon */}
          <span className="absolute top-full left-1/2 -translate-x-1/2 -mt-px w-2 h-2 bg-[#001a12]/95 border-r border-b border-current rotate-45" />
        </span>
      )}
    </span>
  );
}
