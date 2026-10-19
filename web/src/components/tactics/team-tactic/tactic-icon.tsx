'use client';

/**
 * tactic-icon.tsx — one glyph per team tactic.
 *
 * Hand-drawn rather than borrowed from the material set: the closest symbols
 * there are `swap_horiz` / `priority_high` / `bolt`, which are generic enough
 * to also mean "substitution", "warning" and "fast" — and all three of those
 * meanings already live on this page. A tactic is a shape, not a letter.
 *
 * Everything is stroke-only `currentColor` on a 24-unit grid at 1.6 stroke, so
 * the six read as one family next to the 1px borders and the 10px type. The
 * caller owns the colour; this file owns the geometry.
 */
import type { TeamTacticCodeValue } from '../types';

export interface TacticIconProps {
  code: TeamTacticCodeValue | null;
  className?: string;
  size?: number;
}

const PATHS: Record<TeamTacticCodeValue | 'none', React.ReactNode> = {
  // 常规: two level bars — nothing is being pushed anywhere.
  none: (
    <>
      <path d="M5 9.5h14" />
      <path d="M5 14.5h14" />
    </>
  ),

  // 传控压迫: the ball going round. A closed loop with one arrowhead.
  possession: (
    <>
      <path d="M20.5 12a8.5 8.5 0 1 1-2.6-6.1" />
      <path d="M21 3.8v4.6h-4.6" />
    </>
  ),

  // 高位逼抢: two chevrons climbing the pitch.
  high_press: (
    <>
      <path d="M6.5 11.6L12 6l5.5 5.6" />
      <path d="M6.5 18.2L12 12.6l5.5 5.6" />
    </>
  ),

  // 防守反击: the break. A bolt, not a shield — the point is the transition.
  counter: (
    <>
      <path d="M13.6 2.8L5.6 14.2h5.2L9.2 21.2L17.8 9.6h-5.4l1.2-6.8z" />
    </>
  ),

  // 中路渗透: through the middle, between the two flanks.
  central: (
    <>
      <path d="M5 3.5v17" />
      <path d="M19 3.5v17" />
      <path d="M12 3.5v13" />
      <path d="M8.4 13.2L12 16.8l3.6-3.6" />
    </>
  ),

  // 双翼齐飞: the same ball leaving for both touchlines.
  wings: (
    <>
      <path d="M12 12H3.5" />
      <path d="M6.8 8.7L3.5 12l3.3 3.3" />
      <path d="M12 12h8.5" />
      <path d="M17.2 8.7L20.5 12l-3.3 3.3" />
    </>
  ),
};

export function TacticIcon({ code, className = '', size = 20 }: TacticIconProps) {
  return (
    <svg
      aria-hidden
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`shrink-0 ${className}`}
    >
      {PATHS[code ?? 'none']}
    </svg>
  );
}
