/**
 * commentary-icons.tsx — SVG icon set for live commentary.
 *
 * Replaces the emoji icons that previously rendered inside LiveCommentary
 * (⚽🟨🟥🔄🎯📺🏥⛳️ etc). SVGs stay sharp at any size, pick up
 * `currentColor`, and let us animate the goal icon (rotating ball) or
 * the card icons (slight tilt) without bringing in a sprite library.
 *
 * All icons use a 24×24 viewBox and inherit color via `currentColor`.
 * Pass `size` to override; default is 18.
 *
 * Event-type → icon mapping is centralised in `eventIcon()` so the
 * ticker / spotlight / bubble layers all agree on which glyph to show.
 */
import React from 'react';

export interface CommentaryIconProps {
  size?: number;
  className?: string;
  /** Tone override. Defaults to `currentColor`. */
  color?: string;
}

const base = (size = 18): React.SVGAttributes<SVGSVGElement> => ({
  width: size,
  height: size,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
});

// ── Goal: ball with motion lines ──────────────────────────────────────────
export const GoalIcon: React.FC<CommentaryIconProps> = ({ size, className, color }) => (
  <svg {...base(size)} className={className} style={color ? { color } : undefined}>
    <circle cx="12" cy="13" r="7" fill="currentColor" fillOpacity="0.15" />
    <path d="M5 4 L3 1 M9 3 L8 0 M15 3 L16 0" />
    <path d="M7 11 L9 13 L12 11 L15 13 L17 11" />
    <path d="M7 15 L9 13 M12 15 L12 11 M17 15 L15 13" />
  </svg>
);

// ── Shot on target (goal frame) ──────────────────────────────────────────
export const ShotOnTargetIcon: React.FC<CommentaryIconProps> = ({ size, className, color }) => (
  <svg {...base(size)} className={className} style={color ? { color } : undefined}>
    <path d="M3 6 L3 21 L21 21 L21 6" />
    <path d="M3 6 L21 6" />
    <circle cx="14" cy="14" r="1.5" fill="currentColor" />
    <path d="M10 11 L14 14" />
  </svg>
);

// ── Miss (ball flying past post) ─────────────────────────────────────────
export const MissIcon: React.FC<CommentaryIconProps> = ({ size, className, color }) => (
  <svg {...base(size)} className={className} style={color ? { color } : undefined}>
    <path d="M3 6 L3 21 L21 21 L21 6" />
    <path d="M3 6 L21 6" />
    <circle cx="20" cy="3" r="1.6" fill="currentColor" />
    <path d="M16 8 L20 3" />
  </svg>
);

// ── Save (glove) ─────────────────────────────────────────────────────────
export const SaveIcon: React.FC<CommentaryIconProps> = ({ size, className, color }) => (
  <svg {...base(size)} className={className} style={color ? { color } : undefined}>
    <path d="M6 11 L6 5 Q6 3 8 3 Q10 3 10 5 L10 9" />
    <path d="M10 9 L10 4 Q10 2 12 2 Q14 2 14 4 L14 9" />
    <path d="M14 9 L14 5 Q14 3 16 3 Q18 3 18 5 L18 11" />
    <path d="M5 11 L19 11 L18 18 Q18 20 16 20 L8 20 Q6 20 6 18 Z" />
  </svg>
);

// ── Foul (whistle) ───────────────────────────────────────────────────────
export const FoulIcon: React.FC<CommentaryIconProps> = ({ size, className, color }) => (
  <svg {...base(size)} className={className} style={color ? { color } : undefined}>
    <path d="M5 9 L5 15 Q5 17 7 17 L11 17 L17 20 L17 4 L11 7 L7 7 Q5 7 5 9 Z" />
    <circle cx="14" cy="12" r="0.6" fill="currentColor" />
  </svg>
);

// ── Yellow / Red card ────────────────────────────────────────────────────
export const YellowCardIcon: React.FC<CommentaryIconProps> = ({ size, className }) => (
  <svg {...base(size)} className={className}>
    <rect x="6" y="3" width="12" height="18" rx="1.5" fill="#facc15" stroke="#a16207" />
  </svg>
);
export const RedCardIcon: React.FC<CommentaryIconProps> = ({ size, className }) => (
  <svg {...base(size)} className={className}>
    <rect x="6" y="3" width="12" height="18" rx="1.5" fill="#dc2626" stroke="#7f1d1d" />
  </svg>
);

// ── Substitution (two arrows) ────────────────────────────────────────────
export const SubstitutionIcon: React.FC<CommentaryIconProps> = ({ size, className, color }) => (
  <svg {...base(size)} className={className} style={color ? { color } : undefined}>
    <path d="M4 8 L18 8 M14 4 L18 8 L14 12" />
    <path d="M20 16 L6 16 M10 12 L6 16 L10 20" />
  </svg>
);

// ── Corner kick (flag) ───────────────────────────────────────────────────
export const CornerIcon: React.FC<CommentaryIconProps> = ({ size, className, color }) => (
  <svg {...base(size)} className={className} style={color ? { color } : undefined}>
    <path d="M5 21 L5 3" />
    <path d="M5 3 L17 3 L13 7 L17 11 L5 11" />
  </svg>
);

// ── Offside (flag pattern) ───────────────────────────────────────────────
export const OffsideIcon: React.FC<CommentaryIconProps> = ({ size, className, color }) => (
  <svg {...base(size)} className={className} style={color ? { color } : undefined}>
    <path d="M5 21 L5 3" />
    <g fill="currentColor" stroke="none">
      <rect x="5" y="4" width="6" height="6" />
    </g>
    <path d="M11 5 L11 9 M8 5 L8 9" stroke="#fff" />
  </svg>
);

// ── Injury (cross) ───────────────────────────────────────────────────────
export const InjuryIcon: React.FC<CommentaryIconProps> = ({ size, className, color }) => (
  <svg {...base(size)} className={className} style={color ? { color } : undefined}>
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <path d="M12 8 L12 16 M8 12 L16 12" />
  </svg>
);

// ── Free kick ────────────────────────────────────────────────────────────
export const FreeKickIcon: React.FC<CommentaryIconProps> = ({ size, className, color }) => (
  <svg {...base(size)} className={className} style={color ? { color } : undefined}>
    <path d="M3 6 L3 21 L21 21 L21 6" />
    <circle cx="12" cy="17" r="1.5" fill="currentColor" />
  </svg>
);

// ── Penalty (spot) ───────────────────────────────────────────────────────
export const PenaltyIcon: React.FC<CommentaryIconProps> = ({ size, className, color }) => (
  <svg {...base(size)} className={className} style={color ? { color } : undefined}>
    <circle cx="12" cy="19" r="1" fill="currentColor" />
    <path d="M3 6 L3 3 L21 3 L21 6" />
  </svg>
);

// ── Period markers (kickoff, half-time, full-time, etc.) ──────────────────
export const KickoffIcon: React.FC<CommentaryIconProps> = ({ size, className, color }) => (
  <svg {...base(size)} className={className} style={color ? { color } : undefined}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 3 L12 21 M3 12 L21 12" />
  </svg>
);

export const PeriodMarkerIcon: React.FC<CommentaryIconProps> = ({ size, className, color }) => (
  <svg {...base(size)} className={className} style={color ? { color } : undefined}>
    <rect x="4" y="8" width="3" height="8" rx="0.6" fill="currentColor" />
    <rect x="10" y="8" width="3" height="8" rx="0.6" fill="currentColor" />
    <rect x="16" y="8" width="3" height="8" rx="0.6" fill="currentColor" />
  </svg>
);

// ── Crowd / attendance / weather (meta) ──────────────────────────────────
export const AttendanceIcon: React.FC<CommentaryIconProps> = ({ size, className, color }) => (
  <svg {...base(size)} className={className} style={color ? { color } : undefined}>
    <circle cx="8" cy="8" r="3" />
    <circle cx="16" cy="8" r="3" />
    <path d="M3 19 Q3 13 8 13 Q13 13 13 19" />
    <path d="M11 19 Q11 13 16 13 Q21 13 21 19" />
  </svg>
);
export const WeatherIcon: React.FC<CommentaryIconProps> = ({ size, className, color }) => (
  <svg {...base(size)} className={className} style={color ? { color } : undefined}>
    <path d="M6 16 Q3 16 3 13 Q3 10 6 10 Q7 6 12 6 Q17 6 17 11 Q20 11 20 14 Q20 16 18 16 Z" />
  </svg>
);

// ── VAR / Decision (TV screen) ───────────────────────────────────────────
export const VarIcon: React.FC<CommentaryIconProps> = ({ size, className, color }) => (
  <svg {...base(size)} className={className} style={color ? { color } : undefined}>
    <rect x="3" y="5" width="18" height="13" rx="1.5" />
    <path d="M9 21 L15 21 M12 18 L12 21" />
    <path d="M8 11 L8 13 M12 9 L12 15 M16 11 L16 13" strokeWidth="1.5" />
  </svg>
);

// ── Event → icon mapping (canonical type only) ───────────────────────────
export type CanonicalType = string;

const SHOT_VARIANTS = new Set(['SHOT_ON_TARGET', 'SAVE', 'MISS', 'SHOT_OFF_TARGET']);
const PERIOD_VARIANTS = new Set(['HALF_TIME', 'FULL_TIME', 'EXTRA_TIME_START', 'PENALTY_START', 'SECOND_HALF_START', 'FORFEIT']);
const CARD_RED_VARIANTS = new Set(['RED_CARD', 'SECOND_YELLOW']);

export function eventIcon(type: CanonicalType) {
  const t = type.toUpperCase();
  if (t === 'GOAL') return GoalIcon;
  if (t === 'SUBSTITUTION') return SubstitutionIcon;
  if (t === 'YELLOW_CARD') return YellowCardIcon;
  if (CARD_RED_VARIANTS.has(t)) return RedCardIcon;
  if (t === 'INJURY') return InjuryIcon;
  if (t === 'CORNER') return CornerIcon;
  if (t === 'OFFSIDE') return OffsideIcon;
  if (t === 'VAR_DECISION') return VarIcon;
  if (t === 'ATTENDANCE_ANNOUNCEMENT') return AttendanceIcon;
  if (t === 'WEATHER_ANNOUNCEMENT') return WeatherIcon;
  if (t === 'PENALTY') return PenaltyIcon;
  if (t === 'PENALTY_MISS') return PenaltyIcon;
  if (SHOT_VARIANTS.has(t)) return t === 'SAVE' ? SaveIcon : t === 'MISS' || t === 'SHOT_OFF_TARGET' ? MissIcon : ShotOnTargetIcon;
  if (t === 'FOUL') return FoulIcon;
  if (t === 'FREE_KICK') return FreeKickIcon;
  if (t === 'KICKOFF') return KickoffIcon;
  if (PERIOD_VARIANTS.has(t)) return PeriodMarkerIcon;
  return KickoffIcon;
}

/** True when the event deserves the centre-stage spotlight card. */
export function isSpotlightEvent(type: string): boolean {
  const t = type.toUpperCase();
  return t === 'GOAL' || t === 'SUBSTITUTION' || CARD_RED_VARIANTS.has(t) || PERIOD_VARIANTS.has(t);
}
