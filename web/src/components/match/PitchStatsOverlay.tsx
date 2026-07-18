/**
 * PitchStatsOverlay.tsx — 3×3 zone grid rendered ON TOP of the
 * MatchPitch surface when the user toggles "Stats" mode.
 *
 * Layout (when statsMode is on):
 *
 *   ┌───────┬─────────┬─────────┬─────────┐
 *   │       │ LEFT    │ CENTER  │ RIGHT   │
 *   ├───────┼─────────┼─────────┼─────────┤
 *   │ ATK   │ H 5.4   │ H 6.2   │ H 9.0   │
 *   │       │ A 6.6   │ A 5.8   │ A 1.0   │
 *   │       │ 60/40   │ 50/50   │ 80/20   │  ← phase-specific ratio
 *   ├───────┼─────────┼─────────┼─────────┤
 *   │ POS   │ H 5.0   │ H 5.5   │ H 6.0   │
 *   │       │ A 5.0   │ A 4.5   │ A 4.0   │
 *   │       │ 50/50   │ 55/45   │ 60/40   │
 *   ├───────┼─────────┼─────────┼─────────┤
 *   │ DEF   │ ...                         │
 *   └───────┴─────────┴─────────┴─────────┘
 *
 * Three rows (ATK / POS / DEF) × three lanes (L / C / R). Each cell:
 *   - Top line: home value (primary tint, scaled by 100 — 880 reads
 *     as 8.8 so the text fits the cell).
 *   - Bottom line: away value (secondary tint).
 *   - Footer: a phase-specific ratio in the form `home% / away%`.
 *     ATK → home's attack share of the lane (home.atk / total).
 *     POS → possession share (home.pos / total).
 *     DEF → home's defense share (home.def / total).
 *     So the user sees both the magnitude (H/A numbers) AND the split
 *     (% below) for each cell, without leaving the cell.
 *
 * The split is computed from the same raw engine values used in the
 * numbers — stays in lockstep when the snapshot scrubs.
 */

'use client';

import { useTranslations } from 'next-intl';
import { LANES, type Lane, type MatchSnapshot } from './match-pitch-data';

type Phase = 'atk' | 'pos' | 'def';
const PHASES: Phase[] = ['atk', 'pos', 'def'];

// Phase row labels. Reuse `matches.zone.{atk,poss,def}` from the
// existing zone-panel i18n keys — no need to invent duplicates.
const PHASE_LABEL_KEY: Record<Phase, 'atk' | 'poss' | 'def'> = {
  atk: 'atk',
  pos: 'poss',
  def: 'def',
};

interface PitchStatsOverlayProps {
  snapshot: MatchSnapshot;
}

export function PitchStatsOverlay({ snapshot }: PitchStatsOverlayProps) {
  const t = useTranslations('matches.bento.pitchStats');

  return (
    <div
      className="absolute inset-0 grid grid-rows-[auto_1fr] gap-1 p-3"
      data-testid="pitch-stats-grid"
    >
      {/* Column header row */}
      <div className="grid grid-cols-[auto_repeat(3,1fr)] gap-1 items-center">
        <div className="w-14" />
        {LANES.map((lane) => (
          <div
            key={`col-${lane}`}
            className="text-center text-sm font-bold uppercase tracking-widest text-on-surface-variant font-headline py-1"
          >
            {t(`lane.${lane}`)}
          </div>
        ))}
      </div>

      {/* Body rows: ATK / POS / DEF × 3 lanes */}
      <div className="grid grid-rows-3 grid-cols-[auto_repeat(3,1fr)] gap-2 flex-1">
        {PHASES.map((phase) => (
          <PhaseRow key={phase} phase={phase} snapshot={snapshot} />
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// PhaseRow — one label cell + three ZoneCells across the lanes
// ============================================================================

function PhaseRow({
  phase,
  snapshot,
}: {
  phase: Phase;
  snapshot: MatchSnapshot;
}) {
  const tZone = useTranslations('matches.zone');
  return (
    <>
      <div
        className="px-3 py-2 text-base font-bold uppercase tracking-widest text-on-surface font-headline bg-surface-container rounded flex items-center"
        role="rowheader"
      >
        {tZone(PHASE_LABEL_KEY[phase])}
      </div>
      {LANES.map((lane) => (
        <ZoneCell key={`${phase}-${lane}`} phase={phase} lane={lane} snapshot={snapshot} />
      ))}
    </>
  );
}

// ============================================================================
// ZoneCell — single cell: H number / A number / ratio footer
// ============================================================================

function ZoneCell({
  phase,
  lane,
  snapshot,
}: {
  phase: Phase;
  lane: Lane;
  snapshot: MatchSnapshot;
}) {
  // Engine raw values, scaled by 100 for display (880 → 8.8).
  const home = snapshot.h.ls?.[lane]?.[phase] ?? 0;
  const away = snapshot.a.ls?.[lane]?.[phase] ?? 0;
  const total = home + away;
  const homeDisplay = (home / 100).toFixed(1);
  const awayDisplay = (away / 100).toFixed(1);

  // Phase-specific ratio. ATK/POS/DEF all show the same form:
  // home's share of total. Side whose total is 0 → 50/50 muted
  // fallback so the bar never appears empty.
  const homeShare = total === 0 ? 0.5 : home / total;
  const awayShare = 1 - homeShare;
  const homePct = Math.round(homeShare * 100);
  const awayPct = Math.round(awayShare * 100);

  return (
    <div
      className="rounded-lg overflow-hidden border border-outline-variant/40 flex flex-row"
      data-testid={`overlay-cell-${lane}-${phase}`}
    >
      {/* Home (left) */}
      <div
        className="flex-1 flex flex-col items-center justify-center px-2 py-2 border-r border-surface-container-high bg-primary/20"
        title={`Home ${phase}: ${home.toFixed(1)}`}
      >
        <span className="font-headline font-black text-3xl tabular-nums text-on-surface leading-none">
          {homeDisplay}
        </span>
        <span className="text-sm font-bold tabular-nums text-primary font-headline mt-1">
          {homePct}%
        </span>
      </div>
      {/* Away (right) */}
      <div
        className="flex-1 flex flex-col items-center justify-center px-2 py-2 bg-secondary/20"
        title={`Away ${phase}: ${away.toFixed(1)}`}
      >
        <span className="font-headline font-black text-3xl tabular-nums text-on-surface leading-none">
          {awayDisplay}
        </span>
        <span className="text-sm font-bold tabular-nums text-secondary font-headline mt-1">
          {awayPct}%
        </span>
      </div>
    </div>
  );
}