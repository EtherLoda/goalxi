/**
 * pitch-coords.ts — pure helpers for the horizontal side-by-side match pitch.
 *
 * The match page renders home on the LEFT half and away on the RIGHT half of
 * a wide (16:9) pitch — the convention used in football broadcast graphics.
 *
 *   home GK ...... home FW ........ away FW ........ away GK
 *   (4, 50)       (44, 50)         (56, 50)         (96, 50)
 *
 * **Each team stays inside its own half.** The halfway line sits at x=50.
 * Home players occupy x ∈ [0, 50]; away players occupy x ∈ [50, 100]. The
 * most forward slot for each team (CFL / CF / CFR) lands just inside the
 * team's own half, 6 units shy of the center circle — NOT at the
 * opponent's goal like a real attacking run. This is a spectator-side
 * choice: a half-restricted shape reads as a tidy formation at a glance
 * and keeps the two teams' markers from overlapping around the goal
 * mouth.
 *
 * This is intentionally DIFFERENT from the TacticsEditor, which uses a
 * vertical mirror layout. The editor still owns `PITCH_COORDS` in
 * `tactics/types.ts` — that table encodes the editor's vertical layout and
 * must NOT be reused here, because:
 *   - the editor's y axis = attack direction (y=0 = opp goal, y=100 = own goal)
 *   - the match page's x axis = attack direction (x=0 = own goal, x=100 = opp)
 *   - reusing the editor table produces a "saw-tooth" defensive line
 *     (LB x=24, CB1 x=22, CB2 x=20, CB3 x=22, RB x=24) because the editor
 *     spreads CBs across two rows of y; the match page needs them all at
 *     the SAME x.
 *
 * Why a separate layer (not just `computeDimensionOffsets`)?
 *   - Editor axes: y = attack direction (0 = opp goal, 100 = own goal).
 *   - Match axes:  x = attack direction (0 = own goal for home, 100 = opp).
 *   The editor's transform `translateY + scaleX` becomes for the match
 *   page `translateX + scaleY` — same offset magnitudes, swapped axes.
 *
 * Side convention — 180° rotation around (50, 50), not a horizontal mirror.
 * Home attacks right; away attacks left. When a player faces LEFT, the
 * player's left side points SOUTH (bottom of screen); when the same player
 * faces RIGHT, their left side points NORTH (top of screen). So for the
 * away team, the editor's "left" (x = 0) must land at the BOTTOM of the
 * horizontal pitch, and the editor's "right" (x = 100) at the TOP. That
 * means away's y is the FLIP of home's y, not the same value.
 */

import type { PitchSlot, BenchSlot } from '../tactics/types';
import { normalizeLineup } from '../tactics/api-helpers';

// ============================================================================
// Types
// ============================================================================

export type Side = 'home' | 'away';

export interface MatchPitchPoint {
  /** X in [0, 100] — measured along the long axis of the horizontal pitch. */
  x: number;
  /** Y in [0, 100] — measured along the short axis (width). */
  y: number;
}

export interface MatchDimensionOffsets {
  /**
   * Horizontal translation applied to a half-pitch when this team's
   * defensive line is high (positive) or low (negative).
   * Range: -6 to +6, percentage of pitch width.
   */
  translateX: number;
  /**
   * Vertical scale applied to a half-pitch when the team plays wide
   * (>1) or narrow (<1). counter-applied on each player card so the
   * marker shape itself never warps.
   * Range: 0.92 to 1.10.
   */
  scaleY: number;
}

// ============================================================================
// MATCH_PITCH_COORDS — horizontal side-by-side pitch geometry
// ============================================================================

/**
 * Home-side coordinates for the match pitch. Each value here is the HOME
 * position; away is derived by 180° rotation (see `slotToMatchCoords`).
 *
 * Lines (each line shares one x value so the players in it align on screen).
 * Every line lives inside home's own half (x ∈ [0, 50]); the most forward
 * line (FW) is the closest to the center circle, 6 units from x=50:
 *
 *   GK    : x = 4   GK
 *   DEF   : x = 12  LB / CB1 / CB2 / CB3 / RB
 *   DM    : x = 20  LWB / DMF1 / DMF2 / DMF3 / RWB
 *   CM    : x = 28  LM / CM1 / CM2 / CM3 / RM
 *   AM    : x = 36  LW / CAM1 / CAM2 / CAM3 / RW
 *   FW    : x = 44  CFL / CF / CFR
 *
 * y values for a line spread the central slots across the pitch height.
 * The two touchline positions on a line (e.g. LB at y=12 and RB at y=88
 * on the DEF line) anchor the touchlines; the other touchline-tagged
 * slots (LM, RM, LW, RW) share those exact y values so every wide
 * player runs on the same touchline. Wing-backs (LWB/RWB) sit OUTSIDE
 * the touchline at y=4/96 — that's the whole point of a wing-back
 * position: wider than a full-back.
 *
 * Player markers on the match page render at scale ≈ 0.9 of the editor's
 * default size, so a 5-player line (LB, CB1, CB2, CB3, RB) doesn't
 * overlap on a 16:9 pitch — see the scale wrapper in `MatchPitch.tsx`.
 */
export const MATCH_PITCH_COORDS: Readonly<Record<PitchSlot, MatchPitchPoint>> = {
  // GK — last line, hugs the left edge of home's half.
  GK: { x: 4, y: 50 },

  // Defensive line — full-backs + 3 CBs on a single row. The two
  // touchline positions (LB, RB) anchor the y for every other wide
  // player on the team.
  LB: { x: 12, y: 12 },
  CB1: { x: 12, y: 32 },
  CB2: { x: 12, y: 50 },
  CB3: { x: 12, y: 68 },
  RB: { x: 12, y: 88 },

  // DM line — wing-backs sit wider than the touchline (y=4/96) and the
  // central DMs stack across the middle.
  LWB: { x: 20, y: 4 },
  DMF1: { x: 20, y: 32 },
  DMF2: { x: 20, y: 50 },
  DMF3: { x: 20, y: 68 },
  RWB: { x: 20, y: 96 },

  // CM line — wide mids share the touchline y with LB/RB so the
  // touchline reads as a single horizontal rail from back to front.
  LM: { x: 28, y: 12 },
  CM1: { x: 28, y: 32 },
  CM2: { x: 28, y: 50 },
  CM3: { x: 28, y: 68 },
  RM: { x: 28, y: 88 },

  // AM line — wingers share the touchline y with LB/RB and LM/RM.
  LW: { x: 36, y: 12 },
  CAM1: { x: 36, y: 32 },
  CAM2: { x: 36, y: 50 },
  CAM3: { x: 36, y: 68 },
  RW: { x: 36, y: 88 },

  // Forward line — closest to the center circle (x=50), still inside
  // home's own half. The trio CFL / CF / CFR represents a 3-striker
  // shape; the renderer scales markers down to fit the compressed layout.
  CFL: { x: 44, y: 32 },
  CF: { x: 44, y: 50 },
  CFR: { x: 44, y: 68 },
};

/**
 * x value shared by every slot in a tactical "line". Used by tests to
 * pin the same-line invariant without re-deriving it from the table.
 *
 * Every line's x is inside the team's own half. Home: x ∈ {4, 12, 20, 28,
 * 36, 44}; away: x ∈ {56, 64, 72, 80, 88, 96}. The gap at x=50 is the
 * halfway line — neither team crosses it in this spectator layout.
 */
export const MATCH_LINE_X = {
  GK: 4,
  DEF: 12,
  DM: 20,
  CM: 28,
  AM: 36,
  FW: 44,
} as const;

// ============================================================================
// slotToMatchCoords
// ============================================================================

/**
 * Map a `PitchSlot` to a horizontal coordinate on the match pitch.
 *
 * Home looks up `MATCH_PITCH_COORDS[slot]` directly. Away is the 180°
 * rotation of home around (50, 50) — both axes flip. Without the y flip,
 * away's LB / LM / LW would all land at the top of the screen alongside
 * home's — visually mirroring only horizontally ignores that away is
 * facing the opposite direction.
 *
 * Invariants (180° rotation of home around the centre (50, 50)):
 *   - For every slot: away.x === 100 - home.x, away.y === 100 - home.y
 *   - For home:      x ∈ [0, 50]   (left half)
 *   - For away:      x ∈ [50, 100] (right half)
 *
 * Examples (each team inside its own half):
 *   GK  → home (4, 50),    away (96, 50)   ← goalkeepers at outer edges
 *   CF  → home (44, 50),   away (56, 50)   ← strikers just inside own half
 *   LB  → home (12, 12),   away (88, 88)   ← home LB top, away LB bottom
 *   RB  → home (12, 88),   away (88, 12)   ← home RB bottom, away RB top
 */
export function slotToMatchCoords(slot: PitchSlot, side: Side): MatchPitchPoint {
  const home = MATCH_PITCH_COORDS[slot];
  if (side === 'home') {
    return home;
  }
  return { x: 100 - home.x, y: 100 - home.y };
}

// ============================================================================
// computeMatchDimensionOffsets
// ============================================================================

/**
 * Compute translateX + scaleY for one half-pitch based on the team's
 * submitted dimensions.
 *
 *   defensiveLine:
 *     high → team pushes forward (toward opponent's goal)
 *     low  → team drops back toward own goal
 *     mid  → no translation
 *
 *   pitchWidth:
 *     wide    → spread vertically (scaleY > 1)
 *     narrow  → compress vertically (scaleY < 1)
 *     balanced → no scaling
 *
 * The home team attacks RIGHT, so a high line shifts home +X (right).
 * The away team attacks LEFT, so a high line shifts away -X (left).
 * Magnitudes are symmetric: home.translateX + away.translateX === 0.
 */
export function computeMatchDimensionOffsets(
  defensiveLine: 'low' | 'mid' | 'high',
  pitchWidth: 'narrow' | 'balanced' | 'wide',
  side: Side,
): MatchDimensionOffsets {
  const baseTranslate =
    defensiveLine === 'high' ? 6 : defensiveLine === 'low' ? -6 : 0;
  // Multiply so `mid` produces +0 (not -0) when negated for the away side.
  // JS -0 === 0 is true under == but Object.is treats them as distinct —
  // Jest's toBe uses Object.is, so we coerce explicitly.
  const sign = side === 'home' ? 1 : -1;
  const translateX = (baseTranslate * sign) + 0;
  const scaleY =
    pitchWidth === 'wide' ? 1.1 : pitchWidth === 'narrow' ? 0.92 : 1;
  return { translateX, scaleY };
}

// ============================================================================
// Forfeit score rule
// ============================================================================

/**
 * Compute the final score for a forfeit match.
 *
 *   Both forfeit    → 0–0
 *   Home forfeit    → 0–3 (away wins 3–0)
 *   Away forfeit    → 3–0 (home wins 3–0)
 *
 * Mirrors the score rule in `simulator/src/processor/simulation.processor.ts`
 * → `handleRosterForfeit` so the match page renders the same result the
 * simulator persisted. If either rule ever changes, both sites need to
 * move together — pin with tests.
 *
 * Pre-condition: caller must guard via `homeForfeit || awayForfeit` first.
 * When neither team forfeits, the match actually simulated and the score
 * must come from `match.homeScore` / `match.awayScore` (snapshot data) —
 * NOT this helper. Calling with `(false, false)` returns `{home: 3, away: 3}`
 * as a mathematical side-effect of the formula, but that output is
 * meaningless and should never reach the user.
 */
export function forfeitScore(
  homeForfeit: boolean,
  awayForfeit: boolean,
): { home: number; away: number } {
  return {
    home: homeForfeit ? 0 : 3,
    away: awayForfeit ? 0 : 3,
  };
}

// ============================================================================
// normalizePitchLineup
// ============================================================================

/**
 * Coerce a raw backend `Tactics.lineup` map (slot → playerId) into a
 * canonical shape with legacy aliases folded (CB/CD/CDL/CMR/DMF3 → CB1/
 * CB2/CB1/CM3/DMF3 etc.) and bench slots kept separate.
 *
 * Re-exports `normalizeLineup` from `tactics/api-helpers.ts` so the match
 * page has a single, locally-scoped helper. The behavior is identical:
 * silent drop on unknown keys, bench verbatim, pitch normalized.
 */
export function normalizePitchLineup(raw: Record<string, string>): {
  pitch: Partial<Record<PitchSlot, string>>;
  bench: Partial<Record<BenchSlot, string>>;
} {
  return normalizeLineup(raw);
}