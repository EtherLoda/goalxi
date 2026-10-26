/**
 * commentary-icons.tsx — D-style chunky multi-color SVG icon set for
 * live commentary.
 *
 * Style reference: Hattrick's match report icons — strong silhouette,
 * semantic multi-color, no thin outlines, no animations. Each icon is
 * a static SVG with `viewBox="0 0 24 24"`, designed to read at
 * 16/20/32 px and at 1.5x for hero surfaces.
 *
 * Unlike the v1 outline set, the D-style icons carry their own fill
 * and stroke colors (green = positive, red = danger, etc.). They do
 * NOT inherit from `currentColor` — a caller who wants to recolor
 * must wrap the icon in a CSS filter or fork the SVG.
 *
 * The `eventIcon(type)` mapping below is the single source of truth
 * for which glyph each match event renders. The ticker strip,
 * event bubble, and key-event sidebar all call it and render the
 * result with `<entry.IconComponent size={...} />`.
 *
 * D-style additions vs. v1:
 *   - 3 GOAL direction variants (left/center/right) — green ◀▲▶ arrow
 *   - 3 MISS direction variants (left/center/right) — red ◀▲▶ arrow
 *   - 6 WEATHER_* variants (sunny/cloudy/rainy/windy/foggy/snowy)
 *   - TurnoverIcon (U-turn, red↓ + green↑) — was missing in v1
 *   - PlayerIntroIcon, ForfeitIcon, AttendanceIcon (D-style)
 *   - FoulIcon, FreeKickIcon, PenaltyIcon, OffsideIcon, VarIcon (D-style)
 *
 * Backwards-compat aliases:
 *   GoalIcon     = GoalCenterIcon
 *   MissIcon     = MissCenterIcon
 *   WeatherIcon  = WeatherSunnyIcon (fallback)
 *   ShotOnTargetIcon — legacy outline ball (kept for SHOT_ON_TARGET)
 *   SaveIcon     — D-style glove
 */
import React from 'react';
import { signalGold } from '@/lib/design-tokens';
import { shotIcon, shotMarkerFor } from './ShotIcon';

export interface CommentaryIconProps {
  size?: number;
  className?: string;
  /** Tone override. Default for D-style: the icon's built-in palette. */
  color?: string;
}

/**
 * Base SVG attributes. D-style icons set their own fill/stroke; this
 * helper just standardises the viewport, defaults `size` to 18, and
 * marks the SVG aria-hidden (icons are decorative; the textual
 * commentary carries the meaning).
 */
const base = (size = 24): React.SVGAttributes<SVGSVGElement> => ({
  width: size,
  height: size,
  viewBox: '0 0 24 24',
  fill: 'none',
  'aria-hidden': true,
});

// ── Color palette (HT-inspired; locked to dark theme) ───────────────────
const SLATE = '#0f172a';
const SLATE_2 = '#1e293b';
const SLATE_3 = '#334155';
const WHITE = '#f8fafc';
const GREEN = '#34d399';
const RED = '#ef4444';
const YELLOW = signalGold;
const BLUE = '#60a5fa';
const GRAY = '#94a3b8';
const PURPLE = '#a78bfa';

// ── Soccer ball pattern (buckyball: 1 centre pentagon + 5 around) ───────
// Reused by every goal/miss/shot variant. The 5 outer pentagons are the
// same triangle path rotated 72° increments around (12, 14).
const BALL_CENTER_PENTAGON = '12,11 14.5,12.7 13.6,15.7 10.4,15.7 9.5,12.7';
const BALL_OUTER_TRIANGLE = '12,11 9,7 15,7';

// ── Goal: ball + green ▲ / ◀ / ▶ arrow (3 directions) ──────────────────
export const GoalCenterIcon: React.FC<CommentaryIconProps> = ({ size, className }) => (
  <svg {...base(size)} className={className}>
    <path d="M12 0 L9 5.2 L15 5.2 Z" fill={GREEN} stroke={SLATE} strokeWidth="1.2" strokeLinejoin="round" />
    <circle cx="12" cy="14" r="8.5" fill={WHITE} stroke={SLATE} strokeWidth="1.5" />
    <polygon points={BALL_CENTER_PENTAGON} fill={SLATE} />
    <g fill={SLATE}>
      <polygon points={BALL_OUTER_TRIANGLE} />
      <polygon points={BALL_OUTER_TRIANGLE} transform="rotate(72 12 14)" />
      <polygon points={BALL_OUTER_TRIANGLE} transform="rotate(144 12 14)" />
      <polygon points={BALL_OUTER_TRIANGLE} transform="rotate(216 12 14)" />
      <polygon points={BALL_OUTER_TRIANGLE} transform="rotate(288 12 14)" />
    </g>
  </svg>
);

export const GoalLeftIcon: React.FC<CommentaryIconProps> = ({ size, className }) => (
  <svg {...base(size)} className={className}>
    <path d="M1 3 L5 0.69 L5 5.31 Z" fill={GREEN} stroke={SLATE} strokeWidth="1.2" strokeLinejoin="round" />
    <circle cx="12" cy="14" r="8.5" fill={WHITE} stroke={SLATE} strokeWidth="1.5" />
    <polygon points={BALL_CENTER_PENTAGON} fill={SLATE} />
    <g fill={SLATE}>
      <polygon points={BALL_OUTER_TRIANGLE} />
      <polygon points={BALL_OUTER_TRIANGLE} transform="rotate(72 12 14)" />
      <polygon points={BALL_OUTER_TRIANGLE} transform="rotate(144 12 14)" />
      <polygon points={BALL_OUTER_TRIANGLE} transform="rotate(216 12 14)" />
      <polygon points={BALL_OUTER_TRIANGLE} transform="rotate(288 12 14)" />
    </g>
  </svg>
);

export const GoalRightIcon: React.FC<CommentaryIconProps> = ({ size, className }) => (
  <svg {...base(size)} className={className}>
    <path d="M23 3 L19 0.69 L19 5.31 Z" fill={GREEN} stroke={SLATE} strokeWidth="1.2" strokeLinejoin="round" />
    <circle cx="12" cy="14" r="8.5" fill={WHITE} stroke={SLATE} strokeWidth="1.5" />
    <polygon points={BALL_CENTER_PENTAGON} fill={SLATE} />
    <g fill={SLATE}>
      <polygon points={BALL_OUTER_TRIANGLE} />
      <polygon points={BALL_OUTER_TRIANGLE} transform="rotate(72 12 14)" />
      <polygon points={BALL_OUTER_TRIANGLE} transform="rotate(144 12 14)" />
      <polygon points={BALL_OUTER_TRIANGLE} transform="rotate(216 12 14)" />
      <polygon points={BALL_OUTER_TRIANGLE} transform="rotate(288 12 14)" />
    </g>
  </svg>
);

// ── Miss: ball (gray pentagons) + red ▲ / ◀ / ▶ ────────────────────────
export const MissCenterIcon: React.FC<CommentaryIconProps> = ({ size, className }) => (
  <svg {...base(size)} className={className}>
    <path d="M12 0 L9 5.2 L15 5.2 Z" fill={RED} stroke={SLATE} strokeWidth="1.2" strokeLinejoin="round" />
    <circle cx="12" cy="14" r="8.5" fill={WHITE} stroke={SLATE} strokeWidth="1.5" />
    <polygon points={BALL_CENTER_PENTAGON} fill={GRAY} />
    <g fill={GRAY}>
      <polygon points={BALL_OUTER_TRIANGLE} />
      <polygon points={BALL_OUTER_TRIANGLE} transform="rotate(72 12 14)" />
      <polygon points={BALL_OUTER_TRIANGLE} transform="rotate(144 12 14)" />
      <polygon points={BALL_OUTER_TRIANGLE} transform="rotate(216 12 14)" />
      <polygon points={BALL_OUTER_TRIANGLE} transform="rotate(288 12 14)" />
    </g>
  </svg>
);

export const MissLeftIcon: React.FC<CommentaryIconProps> = ({ size, className }) => (
  <svg {...base(size)} className={className}>
    <path d="M1 3 L5 0.69 L5 5.31 Z" fill={RED} stroke={SLATE} strokeWidth="1.2" strokeLinejoin="round" />
    <circle cx="12" cy="14" r="8.5" fill={WHITE} stroke={SLATE} strokeWidth="1.5" />
    <polygon points={BALL_CENTER_PENTAGON} fill={GRAY} />
    <g fill={GRAY}>
      <polygon points={BALL_OUTER_TRIANGLE} />
      <polygon points={BALL_OUTER_TRIANGLE} transform="rotate(72 12 14)" />
      <polygon points={BALL_OUTER_TRIANGLE} transform="rotate(144 12 14)" />
      <polygon points={BALL_OUTER_TRIANGLE} transform="rotate(216 12 14)" />
      <polygon points={BALL_OUTER_TRIANGLE} transform="rotate(288 12 14)" />
    </g>
  </svg>
);

export const MissRightIcon: React.FC<CommentaryIconProps> = ({ size, className }) => (
  <svg {...base(size)} className={className}>
    <path d="M23 3 L19 0.69 L19 5.31 Z" fill={RED} stroke={SLATE} strokeWidth="1.2" strokeLinejoin="round" />
    <circle cx="12" cy="14" r="8.5" fill={WHITE} stroke={SLATE} strokeWidth="1.5" />
    <polygon points={BALL_CENTER_PENTAGON} fill={GRAY} />
    <g fill={GRAY}>
      <polygon points={BALL_OUTER_TRIANGLE} />
      <polygon points={BALL_OUTER_TRIANGLE} transform="rotate(72 12 14)" />
      <polygon points={BALL_OUTER_TRIANGLE} transform="rotate(144 12 14)" />
      <polygon points={BALL_OUTER_TRIANGLE} transform="rotate(216 12 14)" />
      <polygon points={BALL_OUTER_TRIANGLE} transform="rotate(288 12 14)" />
    </g>
  </svg>
);

// ── Shot on target (legacy, no direction): ball + motion lines ──────────
// Kept for SHOT_ON_TARGET — when the engine records a save-able shot
// that doesn't end in a goal. The miss/goal split handles the rest.
export const ShotOnTargetIcon: React.FC<CommentaryIconProps> = ({ size, className }) => (
  <svg {...base(size)} className={className}>
    <path d="M3 4 L5 1 M8 2 L9 -0.5 M14 2 L13 -0.5" stroke={YELLOW} strokeWidth="1.8" strokeLinecap="round" />
    <circle cx="12" cy="14" r="8.5" fill={WHITE} stroke={SLATE} strokeWidth="1.5" />
    <polygon points={BALL_CENTER_PENTAGON} fill={SLATE} />
    <g fill={SLATE}>
      <polygon points={BALL_OUTER_TRIANGLE} />
      <polygon points={BALL_OUTER_TRIANGLE} transform="rotate(72 12 14)" />
      <polygon points={BALL_OUTER_TRIANGLE} transform="rotate(144 12 14)" />
      <polygon points={BALL_OUTER_TRIANGLE} transform="rotate(216 12 14)" />
      <polygon points={BALL_OUTER_TRIANGLE} transform="rotate(288 12 14)" />
    </g>
  </svg>
);

// ── Save: glove (goalkeeper) ────────────────────────────────────────────
export const SaveIcon: React.FC<CommentaryIconProps> = ({ size, className }) => (
  <svg {...base(size)} className={className}>
    <path
      d="M6 11 L6 5 Q6 3 8 3 Q10 3 10 5 L10 9 M10 9 L10 4 Q10 2 12 2 Q14 2 14 4 L14 9 M14 9 L14 5 Q14 3 16 3 Q18 3 18 5 L18 11 M5 11 L19 11 L18 18 Q18 20 16 20 L8 20 Q6 20 6 18 Z"
      fill={YELLOW}
      stroke={SLATE}
      strokeWidth="1.4"
      strokeLinejoin="round"
    />
  </svg>
);

// ── Foul: yellow whistle ────────────────────────────────────────────────
export const FoulIcon: React.FC<CommentaryIconProps> = ({ size, className }) => (
  <svg {...base(size)} className={className}>
    <path d="M4.6 6.2 L4.6 9.6" stroke={RED} strokeWidth="1.9" strokeLinecap="round" opacity="0.9" />
    <path d="M2.2 8.4 L4.4 8.4" stroke={RED} strokeWidth="1.9" strokeLinecap="round" opacity="0.55" />
    <path d="M2.8 11.2 L4.6 10.2" stroke={RED} strokeWidth="1.9" strokeLinecap="round" opacity="0.35" />
    <rect x="8.2" y="4.4" width="8" height="6.6" rx="2.4" fill={YELLOW} stroke={SLATE} strokeWidth="1.5" />
    <path d="M9.6 11 L18.4 11 L16.6 15.6 Q16.2 16.8 15 16.8 L12.6 16.8 Q11.4 16.8 11 15.6 Z" fill={YELLOW} stroke={SLATE} strokeWidth="1.5" strokeLinejoin="round" />
    <rect x="16.4" y="9.2" width="5" height="3.4" rx="1.1" fill={YELLOW} stroke={SLATE} strokeWidth="1.5" />
    <circle cx="10.4" cy="7.8" r="1.3" fill={SLATE} />
    <rect x="9.6" y="17" width="6.4" height="1.8" rx="0.9" fill={YELLOW} stroke={SLATE} strokeWidth="1.2" />
  </svg>
);

export const YellowCardIcon: React.FC<CommentaryIconProps> = ({ size, className }) => (
  <svg {...base(size)} className={className}>
    <g transform="rotate(-11 12 12)">
      <rect x="6.4" y="2.8" width="11.2" height="18.4" rx="1.7" fill={YELLOW} stroke={SLATE} strokeWidth="1.6" />
      <rect x="8.4" y="7" width="7.2" height="1.8" rx="0.6" fill={SLATE} opacity="0.62" />
      <rect x="8.4" y="10.6" width="7.2" height="1.8" rx="0.6" fill={SLATE} opacity="0.34" />
    </g>
  </svg>
);

export const RedCardIcon: React.FC<CommentaryIconProps> = ({ size, className }) => (
  <svg {...base(size)} className={className}>
    <rect x="6.2" y="2.2" width="11.6" height="19.6" rx="1.7" fill={RED} stroke={SLATE} strokeWidth="1.6" />
    <rect x="6.2" y="15.2" width="11.6" height="3.8" fill={WHITE} opacity="0.94" />
    <path d="M6.2 15.2 L17.8 15.2 M6.2 19 L17.8 19" stroke={SLATE} strokeWidth="1.2" />
  </svg>
);

export const SubstitutionIcon: React.FC<CommentaryIconProps> = ({ size, className }) => (
  <svg {...base(size)} className={className}>
    <path d="M1 9 L9 9 L9 6 L13 12 L9 18 L9 15 L1 15 Z" fill={RED} stroke={SLATE} strokeWidth="1.4" strokeLinejoin="round" />
    <path d="M23 9 L15 9 L15 6 L11 12 L15 18 L15 15 L23 15 Z" fill={GREEN} stroke={SLATE} strokeWidth="1.4" strokeLinejoin="round" />
  </svg>
);

// ── Injury: red box + white cross ──────────────────────────────────────
export const InjuryIcon: React.FC<CommentaryIconProps> = ({ size, className }) => (
  <svg {...base(size)} className={className}>
    <rect x="3" y="3" width="18" height="18" rx="3" fill={RED} stroke={SLATE} strokeWidth="1.5" />
    <path d="M12 7 L12 17 M7 12 L17 12" stroke={WHITE} strokeWidth="2.4" strokeLinecap="round" />
  </svg>
);

// ── Corner: gray pole + yellow flag ────────────────────────────────────
export const CornerIcon: React.FC<CommentaryIconProps> = ({ size, className }) => (
  <svg {...base(size)} className={className}>
    <path d="M5 21 L5 4" stroke={GRAY} strokeWidth="2" strokeLinecap="round" />
    <path d="M5 4 L17 4 L13 9 L17 14 L5 14" fill={YELLOW} stroke={SLATE} strokeWidth="1.4" strokeLinejoin="round" />
  </svg>
);

// ── Offside: gray pole + yellow checkered flag ─────────────────────────
export const OffsideIcon: React.FC<CommentaryIconProps> = ({ size, className }) => (
  <svg {...base(size)} className={className}>
    <path
      d="M14 3.2 L14 6.4 M14 8.4 L14 11.6 M14 13.6 L14 16.8 M14 18.8 L14 21.4"
      stroke={WHITE}
      strokeWidth="1.7"
      strokeLinecap="round"
    />
    <circle cx="7.4" cy="9.6" r="3.1" fill={BLUE} stroke={SLATE} strokeWidth="1.5" />
    <circle cx="19.2" cy="17.4" r="3.1" fill={GREEN} stroke={SLATE} strokeWidth="1.5" />
    <path
      d="M15.4 4.6 L21 4.6 M19 2.6 L21.4 4.6 L19 6.6"
      fill="none"
      stroke={RED}
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

export const FreeKickIcon: React.FC<CommentaryIconProps> = ({ size, className }) => (
  <svg {...base(size)} className={className}>
    <path
      d="M3 19 Q9 14 12 9 Q15 4 21 4"
      fill="none"
      stroke={YELLOW}
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeDasharray="2 2"
    />
    <circle cx="4" cy="20" r="2" fill={WHITE} stroke={SLATE} strokeWidth="1.3" />
    <path d="M19 6 L22 4 L20 7 Z" fill={SLATE} />
  </svg>
);

// ── Penalty: goal + ball + spot ────────────────────────────────────────
export const PenaltyIcon: React.FC<CommentaryIconProps> = ({ size, className }) => (
  <svg {...base(size)} className={className}>
    <path d="M9 5 L9 10 M12 5 L12 10 M15 5 L15 10" stroke={GRAY} strokeWidth="1" opacity="0.75" />
    <rect x="3.2" y="2.2" width="17.6" height="2.4" rx="1.2" fill={WHITE} stroke={SLATE} strokeWidth="1.3" />
    <rect x="3.2" y="2.2" width="2.3" height="7.8" rx="1.1" fill={WHITE} stroke={SLATE} strokeWidth="1.3" />
    <rect x="18.5" y="2.2" width="2.3" height="7.8" rx="1.1" fill={WHITE} stroke={SLATE} strokeWidth="1.3" />
    <path d="M12 19.4 L12 13" stroke={YELLOW} strokeWidth="2" strokeLinecap="round" />
    <polygon points="12,10.8 9.8 14.2 14.2 14.2" fill={YELLOW} stroke={SLATE} strokeWidth="0.9" strokeLinejoin="round" />
    <circle cx="12" cy="20.4" r="2.6" fill={WHITE} stroke={SLATE} strokeWidth="1.5" />
  </svg>
);

export const KickoffIcon: React.FC<CommentaryIconProps> = ({ size, className }) => (
  <svg {...base(size)} className={className}>
    <circle cx="12" cy="10.6" r="10.2" fill={GREEN} opacity="0.1" />
    <circle cx="12" cy="10.6" r="6.6" fill="none" stroke={GRAY} strokeWidth="1.6" />
    <rect x="2" y="16" width="20" height="2.2" rx="1.1" fill={WHITE} stroke={SLATE} strokeWidth="1.3" />
    <circle cx="12" cy="10.6" r="4" fill={GREEN} stroke={SLATE} strokeWidth="1.5" />
    <polygon
      points="12,7.9 14.3,9.6 13.4,12.3 10.6,12.3 9.7,9.6"
      fill={WHITE}
      stroke={SLATE}
      strokeWidth="0.9"
      strokeLinejoin="round"
    />
  </svg>
);

export const PeriodMarkerIcon: React.FC<CommentaryIconProps> = ({ size, className }) => (
  <svg {...base(size)} className={className}>
    <path
      d="M12 1.8 L12 3.8 M12 20.2 L12 22.2 M1.8 12 L3.8 12 M20.2 12 L22.2 12"
      stroke={GRAY}
      strokeWidth="1.6"
      strokeLinecap="round"
    />
    <circle cx="12" cy="12" r="8.3" fill={WHITE} stroke={SLATE} strokeWidth="1.6" />
    <path d="M12 12 L12 6.8" stroke={SLATE} strokeWidth="1.9" strokeLinecap="round" />
    <path d="M12 12 L15.9 12" stroke={GREEN} strokeWidth="1.9" strokeLinecap="round" />
    <circle cx="12" cy="12" r="1.2" fill={SLATE} />
  </svg>
);

export const PlayerIntroIcon: React.FC<CommentaryIconProps> = ({ size, className }) => (
  <svg {...base(size)} className={className}>
    <circle cx="12" cy="8" r="4" fill={BLUE} stroke={SLATE} strokeWidth="1.4" />
    <path
      d="M3 21 Q3 13 12 13 Q21 13 21 21 L21 22 L3 22 Z"
      fill={BLUE}
      stroke={SLATE}
      strokeWidth="1.4"
      strokeLinejoin="round"
    />
    <path d="M9 7 Q9 5 12 5 Q15 5 15 7" fill="none" stroke={SLATE} strokeWidth="1.2" strokeLinecap="round" />
  </svg>
);

// ── Attendance: 3 blue silhouettes ────────────────────────────────────
export const AttendanceIcon: React.FC<CommentaryIconProps> = ({ size, className }) => (
  <svg {...base(size)} className={className}>
    <circle cx="6" cy="9" r="2.5" fill={BLUE} stroke={SLATE} strokeWidth="1.2" />
    <circle cx="12" cy="7" r="2.5" fill={BLUE} stroke={SLATE} strokeWidth="1.2" />
    <circle cx="18" cy="9" r="2.5" fill={BLUE} stroke={SLATE} strokeWidth="1.2" />
    <path d="M2 19 Q2 14 6 14 Q9 14 9 17 L9 21 L2 21 Z" fill={BLUE} stroke={SLATE} strokeWidth="1.2" strokeLinejoin="round" />
    <path d="M9 19 Q9 12 12 12 Q15 12 15 19 L15 21 L9 21 Z" fill={BLUE} stroke={SLATE} strokeWidth="1.2" strokeLinejoin="round" />
    <path d="M15 17 Q15 14 18 14 Q22 14 22 19 L22 21 L15 21 Z" fill={BLUE} stroke={SLATE} strokeWidth="1.2" strokeLinejoin="round" />
  </svg>
);

// ── Forfeit: gray whistle + red X circle ───────────────────────────────
export const ForfeitIcon: React.FC<CommentaryIconProps> = ({ size, className }) => (
  <svg {...base(size)} className={className}>
    <rect x="2" y="9" width="14" height="7" rx="2.2" fill={GRAY} stroke={SLATE} strokeWidth="1.4" />
    <rect x="14" y="10" width="6" height="5" rx="1" fill={GRAY} stroke={SLATE} strokeWidth="1.4" />
    <circle cx="6" cy="12.5" r="1.1" fill={SLATE} />
    <path d="M5 9 L5 6 M8 9 L8 6" stroke={SLATE} strokeWidth="1.3" strokeLinecap="round" />
    <circle cx="20" cy="4.5" r="3.2" fill={RED} stroke={SLATE} strokeWidth="1.3" />
    <path d="M18.6 3.1 L21.4 5.9 M21.4 3.1 L18.6 5.9" stroke={WHITE} strokeWidth="1.4" strokeLinecap="round" />
  </svg>
);

// ── VAR: purple TV + white checkmark ───────────────────────────────────
export const VarIcon: React.FC<CommentaryIconProps> = ({ size, className }) => (
  <svg {...base(size)} className={className}>
    <rect x="3" y="4" width="18" height="14" rx="2" fill={PURPLE} stroke={SLATE} strokeWidth="1.5" />
    <path d="M9 21 L15 21 M12 18 L12 21" stroke={SLATE} strokeWidth="1.6" strokeLinecap="round" />
    <path
      d="M7 11 L10 14 L17 7"
      fill="none"
      stroke={WHITE}
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

// ── Turnover: U-turn (red ↓ + green ↑ with green arrow) ────────────────
// The simulator emits a `turnover` event when possession flips without
// a shot/foul (e.g. an intercepted pass). The U-turn encodes "ball
// went one way, came back the other". The arrow's tip y=6 sits flush
// with the column tops y=6; the dark outline below the tip (y=6.7)
// is the only thing that overlaps the column, keeping the
// visual-stack tight without the arrow appearing detached.
export const TurnoverIcon: React.FC<CommentaryIconProps> = ({ size, className }) => (
  <svg {...base(size)} className={className}>
    <path
      d="M7 6 L7 19 Q7 21 9 21 L12 21 L15 21 Q17 21 17 19 L17 6"
      fill="none"
      stroke={SLATE}
      strokeWidth="5.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M7 6 L7 19 Q7 21 9 21 L12 21"
      fill="none"
      stroke={RED}
      strokeWidth="4"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M12 21 L15 21 Q17 21 17 19 L17 6"
      fill="none"
      stroke={GREEN}
      strokeWidth="4"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path d="M12 6.7 L17 0.7 L22 6.7 Z" fill={SLATE} />
    <path d="M13 6 L17 1 L21 6 Z" fill={GREEN} stroke={SLATE} strokeWidth="1.4" strokeLinejoin="round" />
  </svg>
);

// ── Weather (6 variants) ────────────────────────────────────────────────
export const WeatherSunnyIcon: React.FC<CommentaryIconProps> = ({ size, className }) => (
  <svg {...base(size)} className={className}>
    <line x1="12" y1="2" x2="12" y2="4.5" stroke={YELLOW} strokeWidth="1.8" strokeLinecap="round" />
    <line x1="12" y1="19.5" x2="12" y2="22" stroke={YELLOW} strokeWidth="1.8" strokeLinecap="round" />
    <line x1="2" y1="12" x2="4.5" y2="12" stroke={YELLOW} strokeWidth="1.8" strokeLinecap="round" />
    <line x1="19.5" y1="12" x2="22" y2="12" stroke={YELLOW} strokeWidth="1.8" strokeLinecap="round" />
    <line x1="4.6" y1="4.6" x2="6.4" y2="6.4" stroke={YELLOW} strokeWidth="1.8" strokeLinecap="round" />
    <line x1="17.6" y1="17.6" x2="19.4" y2="19.4" stroke={YELLOW} strokeWidth="1.8" strokeLinecap="round" />
    <line x1="19.4" y1="4.6" x2="17.6" y2="6.4" stroke={YELLOW} strokeWidth="1.8" strokeLinecap="round" />
    <line x1="6.4" y1="17.6" x2="4.6" y2="19.4" stroke={YELLOW} strokeWidth="1.8" strokeLinecap="round" />
    <circle cx="12" cy="12" r="4.5" fill={YELLOW} stroke={SLATE} strokeWidth="1.5" />
  </svg>
);

export const WeatherCloudyIcon: React.FC<CommentaryIconProps> = ({ size, className }) => (
  <svg {...base(size)} className={className}>
    <path
      d="M5 17 Q2 17 2 14 Q2 11 5 11 Q6 7 11 7 Q16 7 16 12 Q19 12 19 15 Q19 17 17 17 Z"
      fill={GRAY}
      stroke={SLATE}
      strokeWidth="1.4"
      strokeLinejoin="round"
    />
    <path d="M3 21 L21 21" stroke={SLATE} strokeWidth="1.4" strokeLinecap="round" opacity="0.4" />
  </svg>
);

export const WeatherRainyIcon: React.FC<CommentaryIconProps> = ({ size, className }) => (
  <svg {...base(size)} className={className}>
    <path
      d="M5 12 Q2 12 2 9 Q2 6 5 6 Q6 3 11 3 Q16 3 16 7 Q19 7 19 10 Q19 12 17 12 Z"
      fill={GRAY}
      stroke={SLATE}
      strokeWidth="1.4"
      strokeLinejoin="round"
    />
    <line x1="7" y1="15" x2="6" y2="20" stroke={BLUE} strokeWidth="1.8" strokeLinecap="round" />
    <line x1="12" y1="15" x2="11" y2="20" stroke={BLUE} strokeWidth="1.8" strokeLinecap="round" />
    <line x1="17" y1="15" x2="16" y2="20" stroke={BLUE} strokeWidth="1.8" strokeLinecap="round" />
  </svg>
);

export const WeatherWindyIcon: React.FC<CommentaryIconProps> = ({ size, className }) => (
  <svg {...base(size)} className={className}>
    <path d="M2 8 L13 8 Q16 8 16 6 Q16 4 14 4" stroke={BLUE} strokeWidth="1.8" strokeLinecap="round" fill="none" />
    <path d="M2 14 L18 14 Q21 14 21 12 Q21 10 19 10" stroke={BLUE} strokeWidth="1.8" strokeLinecap="round" fill="none" />
    <path d="M2 20 L11 20 Q13 20 13 18 Q13 16 11 16" stroke={BLUE} strokeWidth="1.8" strokeLinecap="round" fill="none" />
  </svg>
);

export const WeatherFoggyIcon: React.FC<CommentaryIconProps> = ({ size, className }) => (
  <svg {...base(size)} className={className}>
    <line x1="3" y1="7" x2="21" y2="7" stroke={GRAY} strokeWidth="2" strokeLinecap="round" />
    <line x1="3" y1="12" x2="18" y2="12" stroke={GRAY} strokeWidth="1.8" strokeLinecap="round" />
    <line x1="3" y1="17" x2="21" y2="17" stroke={GRAY} strokeWidth="2" strokeLinecap="round" />
    <line x1="6" y1="21" x2="18" y2="21" stroke={GRAY} strokeWidth="1.8" strokeLinecap="round" />
  </svg>
);

export const WeatherSnowyIcon: React.FC<CommentaryIconProps> = ({ size, className }) => (
  <svg {...base(size)} className={className}>
    <path
      d="M5 12 Q2 12 2 9 Q2 6 5 6 Q6 3 11 3 Q16 3 16 7 Q19 7 19 10 Q19 12 17 12 Z"
      fill={GRAY}
      stroke={SLATE}
      strokeWidth="1.4"
      strokeLinejoin="round"
    />
    <g stroke={WHITE} strokeWidth="1.5" strokeLinecap="round">
      <line x1="7" y1="17" x2="7" y2="21" />
      <line x1="5.5" y1="18" x2="8.5" y2="20" />
      <line x1="5.5" y1="20" x2="8.5" y2="18" />
      <line x1="12" y1="17" x2="12" y2="21" />
      <line x1="10.5" y1="18" x2="13.5" y2="20" />
      <line x1="10.5" y1="20" x2="13.5" y2="18" />
      <line x1="17" y1="17" x2="17" y2="21" />
      <line x1="15.5" y1="18" x2="18.5" y2="20" />
      <line x1="15.5" y1="20" x2="18.5" y2="18" />
    </g>
  </svg>
);

// ── Backwards-compat aliases ──────────────────────────────────────────
// Legacy callers imported these names; the D-style icon set keeps them
// pointing at the most common direction (centre).
/** @deprecated Use GoalCenterIcon directly. */
export const GoalIcon = GoalCenterIcon;
/** @deprecated Use MissCenterIcon directly. */
export const MissIcon = MissCenterIcon;
/** @deprecated Use WeatherSunnyIcon directly. */
export const WeatherIcon = WeatherSunnyIcon;

// ── Event → icon mapping (canonical type only) ────────────────────────
export type CanonicalType = string;

const SHOT_VARIANTS = new Set(['SHOT_ON_TARGET', 'SAVE', 'MISS', 'SHOT_OFF_TARGET']);
const PERIOD_VARIANTS = new Set([
  'HALF_TIME',
  'FULL_TIME',
  'EXTRA_TIME_START',
  'PENALTY_START',
  'SECOND_HALF_START',
  'FORFEIT',
]);
const CARD_RED_VARIANTS = new Set(['RED_CARD', 'SECOND_YELLOW']);

/**
 * Look up the icon for a canonical event type. The three callers
 * (LiveCommentary event-bubble, ticker-strip, key-event sidebar) all
 * reach for the same glyph here so a "penalty" event looks the same
 * regardless of which surface the user is reading.
 *
 * Phase 2 (RFC 0002) made `eventClassId` the source of truth for
 * category, but the comment-ticker's `canonicalEventType` still
 * uses `typeName`. Both shapes funnel through this map.
 */
export function eventIcon(
  type: CanonicalType,
  data?: Record<string, unknown> | null,
): React.FC<CommentaryIconProps> {
  const t = type.toUpperCase();
  // Direction-aware shot outcomes default to centre — the engine
  // doesn't track ball-side yet. When/if it does, the FE picks the
  // explicit L/C/R variant.
  if (t === 'GOAL' || t === 'GOAL_CENTER' || t === 'GOAL_LEFT' || t === 'GOAL_RIGHT') {


    return shotIcon('goal', shotMarkerFor(t, data));
  }
  if (t === 'MISS_LEFT') return shotIcon('miss', shotMarkerFor(t, data));
  if (t === 'MISS_RIGHT') return shotIcon('miss', shotMarkerFor(t, data));
  if (t === 'MISS' || t === 'MISS_CENTER' || t === 'SHOT_OFF_TARGET') {
    return shotIcon('miss', shotMarkerFor(t, data));
  }
  if (t === 'SUBSTITUTION') return SubstitutionIcon;
  if (t === 'YELLOW_CARD') return YellowCardIcon;
  if (CARD_RED_VARIANTS.has(t)) return RedCardIcon;
  if (t === 'INJURY') return InjuryIcon;
  if (t === 'CORNER') return CornerIcon;
  if (t === 'OFFSIDE') return OffsideIcon;
  if (t === 'VAR_DECISION' || t === 'VAR') return VarIcon;
  if (t === 'ATTENDANCE_ANNOUNCEMENT') return AttendanceIcon;
  if (t === 'WEATHER_ANNOUNCEMENT') return WeatherIcon;
  if (t === 'PLAYER_INTRODUCTION') return PlayerIntroIcon;
  if (t === 'FORFEIT') return ForfeitIcon;
  // v1 was missing TURNOVER — it fell through to KickoffIcon. The
  // engine emits a `turnover` event for possession flips that don't
  // ride on a foul/shot, so a U-turn is the right glyph.
  if (t === 'TURNOVER') return TurnoverIcon;
  if (t === 'PENALTY') return shotIcon('goal', 'penalty');
  if (t === 'PENALTY_MISS' || t === 'PENALTY_GOAL') {
    return shotIcon(t === 'PENALTY_GOAL' ? 'goal' : 'miss', 'penalty');
  }
  if (SHOT_VARIANTS.has(t)) {
    return shotIcon(t === 'SAVE' ? 'miss' : 'ball', shotMarkerFor(t, data));
  }
  if (t === 'FOUL') return FoulIcon;
  if (t === 'FREE_KICK') return FreeKickIcon;
  if (t === 'KICKOFF') return KickoffIcon;
  if (PERIOD_VARIANTS.has(t)) return PeriodMarkerIcon;
  return KickoffIcon;
}

/** Map a `data.weatherKey` from a weather_announcement event to its icon. */
export function weatherIcon(weatherKey: string | undefined): React.FC<CommentaryIconProps> {
  switch ((weatherKey ?? '').toLowerCase()) {
    case 'sunny':
      return WeatherSunnyIcon;
    case 'cloudy':
      return WeatherCloudyIcon;
    case 'rainy':
      return WeatherRainyIcon;
    case 'windy':
      return WeatherWindyIcon;
    case 'foggy':
      return WeatherFoggyIcon;
    case 'snowy':
      return WeatherSnowyIcon;
    default:
      return WeatherSunnyIcon;
  }
}
