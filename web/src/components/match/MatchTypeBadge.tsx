"use client";

import { useTranslations } from "next-intl";
import { clsx } from "clsx";

/**
 * Wire-format discriminator on `Match.type` (api). The backend
 * returns the lowercase string value of the `MatchType` enum:
 *   - `league`         (default — falls through to the LEAGUE chip)
 *   - `cup`            (national cup matches)
 *   - `tournament`     (reserved for future cups)
 *   - `friendly`       (reserved for future friendlies)
 *   - `national_team`  (reserved for future NT matches)
 *   - `playoff`        (promotion/relegation playoff rows)
 */
export type MatchTypeValue =
  | "league"
  | "cup"
  | "tournament"
  | "friendly"
  | "national_team"
  | "playoff"
  | string; // forward-compat: unknown types render as "Match"

interface MatchTypeBadgeProps {
  type?: string | null;
  /** When `type === 'cup'`, the round number (0..N-1) to show
   *  in the chip label. Ignored for other types. */
  cupRound?: number | null;
  /** Tailwind size variant. `sm` is the default — used in dense
   *  list rows. `md` for hero cards. */
  size?: "sm" | "md";
  className?: string;
}

interface ChipStyle {
  label: string;
  icon: string;
  // Primary chip color (border + bg + text). Kept in CSS variables
  // so dark/light themes can override via globals.css if needed.
  cls: string;
}

const STYLE_BY_TYPE: Record<string, ChipStyle> = {
  league: {
    label: "League",
    icon: "format_list_numbered",
    cls: "text-primary border-primary/30 bg-primary/10",
  },
  cup: {
    label: "Cup",
    icon: "workspace_premium",
    cls: "text-amber-300 border-amber-500/30 bg-amber-500/10",
  },
  tournament: {
    label: "Tournament",
    icon: "emoji_events",
    cls: "text-amber-300 border-amber-500/30 bg-amber-500/10",
  },
  playoff: {
    label: "Playoff",
    icon: "swap_vert",
    cls: "text-blue-300 border-blue-500/30 bg-blue-500/10",
  },
  friendly: {
    label: "Friendly",
    icon: "sports_handshake",
    cls: "text-on-surface-variant border-outline-variant/30 bg-surface-container/50",
  },
  national_team: {
    label: "National",
    icon: "flag",
    cls: "text-red-300 border-red-500/30 bg-red-500/10",
  },
};

const DEFAULT_STYLE: ChipStyle = {
  label: "Match",
  icon: "event",
  cls: "text-on-surface-variant border-outline-variant/30 bg-surface-container/50",
};

/**
 * Compact type chip that distinguishes league / cup / playoff /
 * friendly / national team matches at a glance. Sized for
 * 1-line inclusion in list rows (FixtureTicket, recent match
 * cards) — bigger sizes are easy to add when needed.
 */
export default function MatchTypeBadge({
  type,
  cupRound,
  size = "sm",
  className,
}: MatchTypeBadgeProps) {
  const t = useTranslations("matches.matchType");
  const style = (type && STYLE_BY_TYPE[type]) || DEFAULT_STYLE;
  // For cup matches, the chip label is "Cup R0" (or similar) so
  // the user can see which bracket round they're looking at. The
  // round is 0-indexed in the wire — display as 1-indexed.
  const label =
    type === "cup" && cupRound !== undefined && cupRound !== null
      ? `${t(style.label.toLowerCase()) || style.label} R${cupRound + 1}`
      : t(style.label.toLowerCase()) || style.label;

  const sizing =
    size === "md"
      ? "text-[11px] px-2 py-0.5 gap-1.5"
      : "text-[9px] px-1.5 py-0.5 gap-1";

  return (
    <span
      className={clsx(
        "inline-flex items-center rounded font-label font-black uppercase tracking-widest border shrink-0",
        sizing,
        style.cls,
        className,
      )}
    >
      <span className="material-symbols-outlined text-[12px] leading-none">
        {style.icon}
      </span>
      <span className="leading-none">{label}</span>
    </span>
  );
}
