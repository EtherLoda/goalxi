/**
 * MatchPitch.tsx — horizontal side-by-side pitch for the match report.
 *
 *   ┌────────────────────────────────────────────────────────┐
 *   │   HOME HALF (x: 0–50)         │  AWAY HALF (x: 50–100) │
 *   │                                │                        │
 *   │   GK → CF (left to right)      │ CF → GK (right to left)│
 *   │   x: 4 → 44, all inside half   │ x: 56 → 96            │
 *   │                                │                        │
 *   │              ━━━ halfway line at x=50 ━━━              │
 *   └────────────────────────────────────────────────────────┘
 *
 * Each team stays inside its own half — the most forward slot (CFL / CF
 * / CFR) lands 6 units shy of the center circle, not at the opponent's
 * goal. This is a spectator-side choice (see `pitch-coords.ts` header
 * for the rationale) that keeps the two trios of strikers from
 * overlapping around the goal mouth.
 *
 * Home defends the LEFT goal (attacks right); away defends the RIGHT
 * goal (attacks left). The 180° rotation around (50, 50) lives in
 * `slotToMatchCoords`.
 *
 * Each half applies its own defensiveLine + pitchWidth + tempo:
 *   - defensiveLine → translateX (home +X / away -X when high; opposite when low)
 *   - pitchWidth    → scaleY     (counter-applied on each marker card)
 *   - tempo         → shadow glow on the half-pitch wrapper
 *
 * Markers render at `MATCH_MARKER_SCALE` of the editor's default size,
 * so a 5-player line (LB, CB1, CB2, CB3, RB) at y=12/32/50/68/88 fits
 * without overlap on a 16:9 pitch.
 *
 * Data layer (buildCards / snapshot merging) lives in `match-pitch-data.ts`
 * so it can be unit-tested without React.
 */

'use client';

import { useMemo, type CSSProperties } from 'react';
import type { Player, Tactics } from '@/lib/api';
import { type PitchSlot } from '../tactics/types';
import {
  slotToMatchCoords,
  computeMatchDimensionOffsets,
  forfeitScore,
  type Side,
} from './pitch-coords';
import {
  buildCards,
  type PitchCard,
  type MatchSnapshot,
} from './match-pitch-data';
import { PitchStatsOverlay } from './PitchStatsOverlay';
import { PlayerMarker } from '../tactics/pitch/PlayerMarker';

export type { PitchCard, MatchSnapshot, MatchSnapshotSide, MatchSnapshotPlayer } from './match-pitch-data';
export { buildCards } from './match-pitch-data';

// ============================================================================
// Public types
// ============================================================================

export interface MatchPitchProps {
  homeTactics: Tactics | null;
  awayTactics: Tactics | null;
  homeRoster: Player[];
  awayRoster: Player[];
  /**
   * The snapshot whose player states the pitch should render. The parent
   * (TacticalMatchDetail) owns which minute is "active" — by default it's
   * the latest snapshot, but the SnapshotZonePanel scrubber can swap it
   * out. When `null`, the pitch falls back to submitted tactics (the
   * "predicted lineup" case for kickoff / forfeit / no-snapshot matches).
   */
  activeSnapshot: MatchSnapshot | null;
  /**
   * When true, the pitch swaps its player markers for a 3×3 zone grid
   * showing lane strengths (ATK / POSS / DEF per lane). The toggle chip
   * is rendered in the top-right corner of the pitch — click it to
   * flip back to the player view. This is purely visual; the data
   * shown comes from the same `activeSnapshot.h.ls` / `.a.ls` the
   * player view uses for marker states, so no extra fetch is needed.
   */
  statsMode?: boolean;
  onToggleStatsMode?: () => void;
  /**
   * Forfeit flags from the API. When either is true, the simulator
   * never ran the match — no SNAPSHOT events were emitted and any
   * submitted lineups were never actually played. The pitch must
   * render empty (no player dots) and surface the forfeit banner
   * instead of falling back to `tactics.lineup`.
   *
   * When neither is true and `activeSnapshot` is null, the page is showing
   * submitted tactics as a "predicted" lineup (pre-game) — that case
   * still renders dots, since the user does want to see their lineup.
   */
  homeForfeit?: boolean;
  awayForfeit?: boolean;
  homeTeamName?: string;
  awayTeamName?: string;
}

// ============================================================================
// HalfPitch — one team's pitch overlay with dimension transforms
// ============================================================================

interface HalfPitchProps {
  side: Side;
  cards: PitchCard[];
  /**
   * Combined playerId → Player lookup. HalfPitch resolves each card's
   * playerId against this map; cards whose playerId can't be resolved
   * are silently dropped (mirrors the editor's PitchField behaviour).
   */
  rosterById: Map<string, Player>;
  tempo: 'slow' | 'balanced' | 'fast';
  defensiveLine: 'low' | 'mid' | 'high';
  pitchWidth: 'narrow' | 'balanced' | 'wide';
}

const TEMPO_GLOW: Record<'slow' | 'balanced' | 'fast', string> = {
  slow: 'shadow-none',
  balanced: 'shadow-[0_0_30px_rgba(0,228,121,0.12)]',
  fast: 'shadow-[0_0_60px_rgba(0,228,121,0.25)]',
};

/**
 * Visual scale applied to each player marker on the match page. The
 * editor's `PlayerMarker` is sized for the full pitch (18 individual
 * slots across a 100-wide editor canvas). On the match page, 11 players
 * per team share a single 50-wide half — a 5-player DEF line (LB, CB1,
 * CB2, CB3, RB) at y=12/32/50/68/88 would otherwise overlap vertically
 * on a 16:9 pitch. Scaling the marker down to 90% of editor size
 * preserves readability while leaving breathing room.
 *
 * 0.9 was picked empirically: 5 markers on the DEF line end up ~72 px
 * tall, leaving ~30 px gap on a typical 450 px tall pitch. LM/RM and
 * LW/RW share the LB/RB touchline y, so the three top positions (LB,
 * LM, LW) and three bottom positions (RB, RM, RW) render in clean
 * horizontal rails.
 */
const MATCH_MARKER_SCALE = 0.9;

function HalfPitch({
  side,
  cards,
  rosterById,
  tempo,
  defensiveLine,
  pitchWidth,
}: HalfPitchProps) {
  const offsets = computeMatchDimensionOffsets(defensiveLine, pitchWidth, side);
  const counterScaleY = 1 / offsets.scaleY;
  const glow = TEMPO_GLOW[tempo];

  const wrapperStyle: CSSProperties = {
    transform: `translateX(${offsets.translateX}%) scaleY(${offsets.scaleY})`,
    transformOrigin: 'center center',
  };

  // Drop cards whose playerId isn't in the roster (e.g. snapshot data
  // referring to a player neither half fetched). The slot-key null
  // case is also dropped — PlayerMarker requires a canonical slot.
  const renderable = cards.flatMap((card) => {
    if (card.slotKey === null) return [];
    const player = rosterById.get(card.playerId);
    if (!player) return [];
    return [{ card, player, slotKey: card.slotKey }];
  });

  return (
    <div
      className={`absolute inset-0 pointer-events-none transition-transform duration-500 ease-out ${glow}`}
      style={wrapperStyle}
      data-side={side}
    >
      {renderable.map(({ card, player, slotKey }) => {
        const coords = slotToMatchCoords(slotKey, side);
        return (
          <div
            key={`${side}-${card.playerId}`}
            className="absolute z-10"
            style={{
              left: `${coords.x}%`,
              top: `${coords.y}%`,
              transform: 'translate(-50%, -50%)',
            }}
          >
            <div style={{ transform: `scaleY(${counterScaleY})` }}>
              {/* Inner scale wrapper: shrinks the marker to MATCH_MARKER_SCALE
                  of editor size. `transform-origin: center` keeps the marker
                  centered on the (x, y) position after scaling — without it,
                  the marker would visually drift because of the parent's
                  `translate(-50%, -50%)` centering. */}
              <div
                style={{
                  transform: `scale(${MATCH_MARKER_SCALE})`,
                  transformOrigin: 'center center',
                }}
              >
                <PlayerMarker
                  player={player}
                  slot={slotKey}
                  isGkSlot={slotKey === 'GK'}
                />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ============================================================================
// MatchPitch — top-level container
// ============================================================================

export function MatchPitch({
  homeTactics,
  awayTactics,
  homeRoster,
  awayRoster,
  activeSnapshot,
  statsMode = false,
  onToggleStatsMode,
  homeForfeit = false,
  awayForfeit = false,
  homeTeamName,
  awayTeamName,
}: MatchPitchProps) {
  // Combined map for both player lookup (used by HalfPitch render) AND
  // buildCards display-name fallback. Snapshot playerIds may reference
  // either team, and we resolve display names against this single map.
  const rosterById = useMemo(() => {
    const map = new Map<string, Player>();
    for (const p of homeRoster) map.set(p.id, p);
    for (const p of awayRoster) map.set(p.id, p);
    return map;
  }, [homeRoster, awayRoster]);

  // When either team forfeits, the simulator never ran the match and
  // there are no SNAPSHOT events. Render an empty pitch + banner and
  // skip the dot-rendering entirely — even submitted `tactics.lineup`
  // was never actually played (the lineup may be a stale default
  // preset auto-copied by the scheduler, or a partial submission).
  const isForfeit = homeForfeit || awayForfeit;

  const homeCards = useMemo(
    () => buildCards(homeTactics, activeSnapshot?.h.ps ?? null, rosterById),
    [homeTactics, activeSnapshot, rosterById],
  );
  const awayCards = useMemo(
    () => buildCards(awayTactics, activeSnapshot?.a.ps ?? null, rosterById),
    [awayTactics, activeSnapshot, rosterById],
  );

  const homeTempo = homeTactics?.tempo ?? 'balanced';
  const awayTempo = awayTactics?.tempo ?? 'balanced';
  const homeLine = homeTactics?.defensiveLine ?? 'mid';
  const awayLine = awayTactics?.defensiveLine ?? 'mid';
  const homeWidth = homeTactics?.pitchWidth ?? 'balanced';
  const awayWidth = awayTactics?.pitchWidth ?? 'balanced';

  return (
    <div className="relative w-full aspect-video rounded-2xl overflow-hidden border border-white/5 bg-[#051a14]">
      {/* Everything pitch-mode (gradient, stripes, markings, player
          halves, forfeit chip) is rendered ONLY in non-stats mode.
          When `statsMode` is true the container shows exclusively the
          PitchStatsOverlay grid — no overlap, no see-through. The two
          views are mutually exclusive so the reader can never confuse
          a player dot for a data point. */}
      {!statsMode && (
        <>
          {/* Pitch surface — emerald gradient + vertical stripes (perpendicular
              to attack direction in this layout). */}
          <div className="absolute inset-0 bg-linear-to-r from-emerald-950/40 via-emerald-900/30 to-emerald-950/40" />
          <div className="absolute inset-0 opacity-20 bg-[repeating-linear-gradient(90deg,transparent,transparent_40px,rgba(0,0,0,0.15)_40px,rgba(0,0,0,0.15)_80px)]" />

          {/* Single SVG: pitch markings span the whole pitch. */}
          <svg
            className="absolute inset-0 w-full h-full"
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
          >
            {/* Outer rectangle */}
            <rect
              x="2"
              y="6"
              width="96"
              height="88"
              fill="none"
              stroke="rgba(0,228,121,0.18)"
              strokeWidth="0.3"
            />
            {/* Halfway line (vertical at x=50) */}
            <line
              x1="50"
              y1="6"
              x2="50"
              y2="94"
              stroke="rgba(0,228,121,0.18)"
              strokeWidth="0.3"
            />
            {/* Center circle */}
            <circle
              cx="50"
              cy="50"
              r="6"
              fill="none"
              stroke="rgba(0,228,121,0.18)"
              strokeWidth="0.3"
            />
            <circle cx="50" cy="50" r="0.4" fill="rgba(0,228,121,0.4)" />

            {/* Home penalty area (left goal) */}
            <path
              d="M 4 30 L 16 30 L 16 70 L 4 70"
              fill="none"
              stroke="rgba(0,228,121,0.18)"
              strokeWidth="0.3"
            />
            {/* Away penalty area (right goal) */}
            <path
              d="M 96 30 L 84 30 L 84 70 L 96 70"
              fill="none"
              stroke="rgba(0,228,121,0.18)"
              strokeWidth="0.3"
            />
            {/* Home goal area (small box) */}
            <path
              d="M 4 38 L 10 38 L 10 62 L 4 62"
              fill="none"
              stroke="rgba(0,228,121,0.12)"
              strokeWidth="0.3"
            />
            {/* Away goal area (small box) */}
            <path
              d="M 96 38 L 90 38 L 90 62 L 96 62"
              fill="none"
              stroke="rgba(0,228,121,0.12)"
              strokeWidth="0.3"
            />
          </svg>

          {/* Home half — LEFT, defends left goal */}
          <HalfPitch
            side="home"
            cards={homeCards}
            rosterById={rosterById}
            tempo={homeTempo}
            defensiveLine={homeLine}
            pitchWidth={homeWidth}
          />

          {/* Away half — RIGHT, defends right goal */}
          <HalfPitch
            side="away"
            cards={awayCards}
            rosterById={rosterById}
            tempo={awayTempo}
            defensiveLine={awayLine}
            pitchWidth={awayWidth}
          />

          {/* Forfeit chip — sits at the top of the pitch as a banner,
              NOT a full-pitch replacement. Player dots and pitch
              markings stay visible underneath; the chip just surfaces
              the result + reason so the reader doesn't mistake the
              rendered lineups for a real match. */}
          {isForfeit && (
            <ForfeitBanner
              homeForfeit={homeForfeit}
              awayForfeit={awayForfeit}
              homeTeamName={homeTeamName ?? 'Home'}
              awayTeamName={awayTeamName ?? 'Away'}
            />
          )}
        </>
      )}

      {/* Stats mode — REPLACES the entire pitch surface with the 3×3
          data grid (mutually exclusive with the players view above).
          No `aria-hidden` / `pointer-events-none` here because the
          overlay IS the content of the container, not an overlay on
          top — interactions inside the cells (e.g. tooltips, future
          drill-downs) belong to this surface. */}
      {statsMode && activeSnapshot && (
        <div className="absolute inset-0" data-testid="pitch-stats-overlay">
          <PitchStatsOverlay snapshot={activeSnapshot} />
        </div>
      )}
    </div>
  );
}

// ============================================================================
// ForfeitBanner — top-strip overlay for forfeit matches.
//
// Players render normally underneath (the page surfaces the submitted
// lineups as "who would have played"). The banner is a thin top strip
// with the score + headline + reason — never covers the pitch.
// ============================================================================

interface ForfeitBannerProps {
  homeForfeit: boolean;
  awayForfeit: boolean;
  homeTeamName: string;
  awayTeamName: string;
}

function ForfeitBanner({
  homeForfeit,
  awayForfeit,
  homeTeamName,
  awayTeamName,
}: ForfeitBannerProps) {
  // Score rule lives in pitch-coords.ts so simulator + frontend can't drift.
  const { home: homeScore, away: awayScore } = forfeitScore(
    homeForfeit,
    awayForfeit,
  );

  const headline =
    homeForfeit && awayForfeit
      ? 'MUTUAL FORFEIT'
      : homeForfeit
        ? `${awayTeamName} wins by forfeit`
        : `${homeTeamName} wins by forfeit`;

  const reason =
    homeForfeit && awayForfeit
      ? 'Neither team fielded a legal roster.'
      : homeForfeit
        ? `${homeTeamName} failed to field a legal roster.`
        : `${awayTeamName} failed to field a legal roster.`;

  return (
    <div
      className="absolute top-3 left-1/2 -translate-x-1/2 z-30 pointer-events-none"
      data-testid="forfeit-banner"
      role="status"
    >
      <div className="flex items-center gap-3 px-4 py-2 rounded-full bg-error/15 border border-error/40 backdrop-blur-sm">
        <span className="font-label text-[9px] tracking-[0.3em] uppercase text-error/90">
          Forfeit
        </span>
        <span className="font-headline font-black text-sm text-white tabular-nums">
          {homeScore} – {awayScore}
        </span>
        <span className="font-headline font-bold text-[10px] uppercase tracking-wider text-white whitespace-nowrap">
          {headline}
        </span>
      </div>
      <p className="mt-1 text-center font-label text-[9px] tracking-widest uppercase text-outline">
        {reason}
      </p>
    </div>
  );
}