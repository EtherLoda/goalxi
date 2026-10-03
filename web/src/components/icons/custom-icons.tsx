import type { LucideProps } from "lucide-react";

/**
 * Hand-drawn stroke icons for glyphs neither Material, Lucide nor
 * Tabler provides (or where borrowing another pack's shape would
 * misread). Drawn to the same contract lucide-react components
 * satisfy: 24x24 grid, fill="none", stroke=currentColor — so they
 * drop into <AppIcon> and (if ever needed) morphicons unchanged.
 */
export function StadiumIcon({ size, strokeWidth, ...props }: LucideProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size ?? 24}
      height={size ?? 24}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth ?? 2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <rect x="3" y="4" width="18" height="16" rx="3" />
      <rect x="6.5" y="7.5" width="11" height="9" rx="1" />
      <line x1="12" y1="7.5" x2="12" y2="16.5" />
      <circle cx="12" cy="12" r="1.75" />
    </svg>
  );
}

/** Football (soccer) — Lucide has no soccer ball; Material's
 * `sports_soccer` maps here. Circle + centre pentagon + spokes. */
export function BallIcon({ size, strokeWidth, ...props }: LucideProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size ?? 24}
      height={size ?? 24}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth ?? 2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8.5 15.33 10.92 14.06 14.83 9.94 14.83 8.67 10.92Z" fill="currentColor" />
      <line x1="12" y1="8.5" x2="12" y2="3" />
      <line x1="15.33" y1="10.92" x2="20.56" y2="9.22" />
      <line x1="14.06" y1="14.83" x2="17.29" y2="19.28" />
      <line x1="9.94" y1="14.83" x2="6.71" y2="19.28" />
      <line x1="8.67" y1="10.92" x2="3.44" y2="9.22" />
    </svg>
  );
}

/** Referee card — replaces the 🟨 / 🟥 emoji markers. Same shape for
 * both; the card's colour comes from currentColor at the call site.
 * Filled (not stroked) so it reads at 9–13px inside timeline dots. */
function CardIcon({ size, strokeWidth, ...props }: LucideProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size ?? 24}
      height={size ?? 24}
      viewBox="0 0 24 24"
      fill="currentColor"
      stroke="currentColor"
      strokeWidth={strokeWidth ?? 1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <rect x="7" y="3.5" width="10" height="17" rx="1.5" />
    </svg>
  );
}

export const YellowCardIcon = CardIcon;
export const RedCardIcon = CardIcon;

/** Basketball — Lucide has no basketball; Material's
 * `sports_basketball` maps here. Circle + equator/meridian + seams. */
export function BasketballIcon({ size, strokeWidth, ...props }: LucideProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size ?? 24}
      height={size ?? 24}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth ?? 2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <circle cx="12" cy="12" r="9" />
      <line x1="12" y1="3" x2="12" y2="21" />
      <line x1="3" y1="12" x2="21" y2="12" />
      <path d="M6.4 4.8C8.6 7.2 8.6 16.8 6.4 19.2" />
      <path d="M17.6 4.8C15.4 7.2 15.4 16.8 17.6 19.2" />
    </svg>
  );
}
