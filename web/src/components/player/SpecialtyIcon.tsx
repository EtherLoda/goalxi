"use client";

import clsx from "clsx";
import { getSpecialtyFile } from "@/lib/specialties";

/**
 * SpecialtyIcon — renders a v2 player specialty as an inline SVG via
 * <img>. The SVGs live in `web/public/specialties/<file>.svg` and
 * ship with `currentColor` strokes, so the icon's actual color is
 * controlled by a wrapping `text-*` Tailwind class.
 *
 * v2 changes from v1:
 *   1. Tier is now part of the contract — every specialty has a
 *      Gold/Silver/Bronze tier (or no specialty at all). The
 *      `tier` prop drives a per-tier text-color class so the icon
 *      reads as Gold (amber) / Silver (slate) / Bronze (zinc).
 *   2. Null / undefined code renders a "—" placeholder (v1 silently
 *      rendered a dot), which is the 50% of players who have no
 *      specialty under the new 5/15/30/50 distribution.
 *   3. The `noSpec` mode lets the caller force the placeholder
 *      even if a code is present (e.g. when displaying a v1
 *      specialty that's been migrated to NULL).
 */
type Size = "xs" | "sm" | "md" | "lg";
type Tier = "GOLD" | "SILVER" | "BRONZE";

const SIZE_CLASS: Record<Size, string> = {
  xs: "w-3 h-3",
  sm: "w-3.5 h-3.5",
  md: "w-4 h-4",
  lg: "w-5 h-5",
};

/**
 * Per-tier text-color class. The SVG asset uses `currentColor` so
 * the parent text class propagates into the stroke. Tier colors are
 * picked to read at small sizes against the dark UI background:
 *   GOLD   = amber-300 (warm, premium)
 *   SILVER = slate-300 (cool, neutral)
 *   BRONZE = stone-400 (muted, baseline)
 */
const TIER_TEXT: Record<Tier, string> = {
  GOLD: "text-amber-300",
  SILVER: "text-slate-300",
  BRONZE: "text-stone-400",
};

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
};

export function SpecialtyIcon({
  code,
  tier = "BRONZE",
  size = "md",
  className,
  title,
  noSpec,
}: Props) {
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

  const file = getSpecialtyFile(code);
  if (!file) {
    // Unknown code (e.g. legacy data still on v1) — render a
    // neutral dot so the layout stays intact.
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

  return (
    <img
      src={`/specialties/${file}.svg`}
      alt=""
      aria-hidden
      title={title ?? `${code} (${tier})`}
      className={clsx(
        "inline-block align-middle",
        SIZE_CLASS[size],
        TIER_TEXT[tier],
        className,
      )}
    />
  );
}
