/**
 * SnapshotZonePanel.tsx — snapshot-driven zone stats panel for the match
 * report page.
 *
 * Sits to the right of the horizontal pitch, same height, 320 px wide.
 * Renders:
 *
 *   - header (active snapshot index + minute)
 *   - snapshot scrubber — drag updates a local draft; commit on mouseup /
 *     touchend so the pitch (which reads `activeSnapshot`) only re-renders
 *     once per settle, never mid-drag
 *   - 3 lane rows (LEFT / CENTER / RIGHT) — each row holds ATK / DEF /
 *     POSS sub-cells with home + away numbers and mirrored bars
 *   - 2 ratio sections (POSSESSION SHARE / PUSH SUCCESS RATE) — three
 *     rows each (one per lane) with home% / away% and a single split bar
 *
 * The panel is fully driven by the `MatchSnapshot` shape from
 * `match-pitch-data.ts`. No data fetches, no Zustand, no Redux — pure
 * props in / props out.
 *
 * Formulas mirror the simulator exactly:
 *   - lane possession share = home.ls[lane].pos / (home + away)
 *   - push success rate     = lc[lane].ps_ / lc[lane].att  (per side)
 */

'use client';

import { useState, type CSSProperties } from 'react';
import { useTranslations } from 'next-intl';
import { LANES, type MatchSnapshot, type Lane } from './match-pitch-data';
import {
  lanePossessionShare,
  computePushRate,
  shouldCommitScrubber,
} from './snapshot-stats';

// ============================================================================
// Public types
// ============================================================================

export interface SnapshotZonePanelProps {
  /** All snapshots for the match, oldest first. */
  snapshots: MatchSnapshot[];
  /** Index into `snapshots` of the currently-displayed minute. */
  activeIndex: number;
  /**
   * Called when the user settles on a new snapshot — on mouseup /
   * touchend of the scrubber, or after a keyboard arrow press. The
   * page updates its `activeSnapshot` state in response, which then
   * drives the pitch's player markers AND the panel's content.
   */
  onChange: (index: number) => void;
}

// ============================================================================
// Metric / lane constants
// ============================================================================

type Metric = 'atk' | 'def' | 'pos';

const METRIC_LABEL_KEY: Record<Metric, string> = {
  atk: 'atk',
  def: 'def',
  pos: 'poss',
};

const METRIC_BAR_MAX = 100; // lane strengths land in [0, 100] in practice

const RANGE_MIN_HEIGHT = 'min-height: 0';

// ============================================================================
// SnapshotZonePanel
// ============================================================================

export function SnapshotZonePanel({
  snapshots,
  activeIndex,
  onChange,
}: SnapshotZonePanelProps) {
  const t = useTranslations('matches.zone');

  // Empty state — match produced no snapshots (forfeit pre-simulation or
  // legacy match without the snapshot emission). Show a placeholder rather
  // than a broken scrubber.
  if (snapshots.length === 0) {
    return (
      <div
        className="rounded-2xl border border-surface-container-high bg-surface-container-low p-4 text-center"
        data-testid="snapshot-zone-panel-empty"
      >
        <p className="text-on-surface-variant text-xs font-headline">
          {t('noSnapshots')}
        </p>
      </div>
    );
  }

  const safeActiveIndex = Math.min(
    Math.max(activeIndex, 0),
    snapshots.length - 1,
  );
  const active = snapshots[safeActiveIndex];

  return (
    <div
      className="rounded-2xl border border-surface-container-high bg-surface-container-low flex flex-col h-full overflow-hidden"
      data-testid="snapshot-zone-panel"
    >
      <PanelHeader
        index={safeActiveIndex}
        total={snapshots.length}
        minute={active.minute}
      />

      <Scrubber
        count={snapshots.length}
        activeIndex={safeActiveIndex}
        onCommit={onChange}
      />

      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
        <LaneStats active={active} />
        <RatioSection
          title={t('possessionShare')}
          rows={LANES.map((lane) => {
            const homeShare = lanePossessionShare(active.h, active.a, lane);
            return {
              lane,
              homeValue: homeShare,
              awayValue: homeShare === null ? null : 1 - homeShare,
            };
          })}
        />
        <RatioSection
          title={t('pushSuccess')}
          rows={LANES.map((lane) => ({
            lane,
            homeValue: computePushRate(active, lane, 'h'),
            awayValue: computePushRate(active, lane, 'a'),
          }))}
        />
      </div>
    </div>
  );
}

// ============================================================================
// PanelHeader — snap N / M · minute'
// ============================================================================

function PanelHeader({
  index,
  total,
  minute,
}: {
  index: number;
  total: number;
  minute: number;
}) {
  const t = useTranslations('matches.zone');
  return (
    <div className="flex items-center justify-between px-4 py-3 border-b border-surface-container-high">
      <h3 className="font-headline font-bold text-xs uppercase tracking-widest text-primary flex items-center gap-1.5">
        <span className="material-symbols-outlined text-sm text-primary">
          radar
        </span>
        {t('title')}
      </h3>
      <span className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant font-headline tabular-nums">
        {t('snapLabel', { index: index + 1, total, minute })}
      </span>
    </div>
  );
}

// ============================================================================
// Scrubber — debounced range input
// ============================================================================

/**
 * Scrubber that commits only when the user settles — on mouseup,
 * touchend, or keyboard release. During drag the visual value follows
 * the cursor, but the parent's `activeIndex` stays put so the pitch
 * (which reads `activeSnapshot`) doesn't re-render frame-by-frame.
 *
 * Implemented with a native `<input type="range">` for built-in keyboard
 * arrow handling + accessibility. Tick marks below the track visualize
 * each snapshot as a small dot — gives the reader a sense of how
 * dense the timeline is (a 90-min match has ~18 ticks).
 */
function Scrubber({
  count,
  activeIndex,
  onCommit,
}: {
  count: number;
  activeIndex: number;
  onCommit: (index: number) => void;
}) {
  // `draftIndex` is the position the user is currently hovering / pressing.
  // `null` when not actively interacting — fall back to `activeIndex` for
  // both the slider position and the lane data shown below.
  const [draftIndex, setDraftIndex] = useState<number | null>(null);
  const displayIndex = draftIndex ?? activeIndex;

  // Single source of truth for "commit current draft". Used by mouseup,
  // touchend, and keyboard release. The decision (commit vs skip) is
  // delegated to `shouldCommitScrubber` so the rule has a covering spec
  // in node (no jsdom / RTL needed). Returns `null` for "no commit";
  // otherwise fires onCommit with the new index.
  const commitDraft = () => {
    const next = shouldCommitScrubber(draftIndex, activeIndex);
    if (next !== null) onCommit(next);
    setDraftIndex(null);
  };

  return (
    <div className="px-4 py-2 border-b border-surface-container-high bg-surface-container-lowest/40">
      <input
        type="range"
        min={0}
        max={count - 1}
        step={1}
        value={displayIndex}
        onChange={(e) => setDraftIndex(Number(e.target.value))}
        onMouseUp={commitDraft}
        onTouchEnd={commitDraft}
        onKeyUp={commitDraft}
        // aria-valuetext shows the actual minute rather than the index,
        // so a screen-reader user hears e.g. "35 minutes" not "14".
        aria-valuetext={`${displayIndex + 1} / ${count}`}
        className="w-full h-2 appearance-none bg-surface-container-high rounded-full outline-none cursor-pointer accent-primary"
        data-testid="snapshot-scrubber"
      />
      {/* Tick marks — one small dot per snapshot, positioned at
          index/(count-1) along the track. Renders as a separate layer
          underneath the range input so the input's own thumb can still
          be dragged. Active tick matches primary; inactive is muted. */}
      <ScrubberTicks count={count} activeIndex={displayIndex} />
    </div>
  );
}

/**
 * Tick row below the scrubber — purely visual, no event handlers (the
 * range input above owns all interaction). Each tick is a 2px dot at
 * the corresponding horizontal position; the active tick scales up and
 * picks up the primary color.
 */
function ScrubberTicks({
  count,
  activeIndex,
}: {
  count: number;
  activeIndex: number;
}) {
  if (count <= 1) return null;
  return (
    <div
      className="relative h-2 mt-1 mx-1"
      data-testid="snapshot-scrubber-ticks"
      aria-hidden="true"
    >
      {Array.from({ length: count }, (_, i) => {
        // Position first / last ticks at the very ends so the row
        // visually lines up with the range track above (which has 0.5
        // cell of thumb radius). For a single-tick count we don't
        // render (handled by parent); for 2+ ticks we spread evenly.
        const left =
          count === 1 ? 50 : (i / (count - 1)) * 100;
        const isActive = i === activeIndex;
        return (
          <span
            key={i}
            className={
              isActive
                ? 'absolute top-1/2 -translate-x-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-primary shadow-[0_0_4px_rgba(0,228,121,0.5)]'
                : 'absolute top-1/2 -translate-x-1/2 -translate-y-1/2 w-1 h-1 rounded-full bg-outline-variant/60'
            }
            style={{ left: `${left}%` }}
            data-testid={isActive ? 'scrubber-tick-active' : undefined}
          />
        );
      })}
    </div>
  );
}

// ============================================================================
// LaneStats — 3 lane rows × ATK / DEF / POSS sub-cells
// ============================================================================

function LaneStats({ active }: { active: MatchSnapshot }) {
  const t = useTranslations('matches.zone');
  return (
    <div className="space-y-2">
      {LANES.map((lane) => (
        <div
          key={lane}
          className="rounded-lg border border-surface-container-high bg-surface-container px-2.5 py-2"
          data-testid={`lane-stats-${lane}`}
        >
          <LaneHeader lane={lane} />
          <div className="mt-1.5 space-y-1.5">
            <MetricCell
              metric="atk"
              active={active}
              lane={lane}
              label={t('atk')}
            />
            <MetricCell
              metric="def"
              active={active}
              lane={lane}
              label={t('def')}
            />
            <MetricCell
              metric="pos"
              active={active}
              lane={lane}
              label={t('poss')}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function LaneHeader({ lane }: { lane: Lane }) {
  const t = useTranslations('matches.zone');
  // Lane label: "LEFT" + " (top touchline)" sublabel. Home attacks
  // right, so home's left side is at the top of the pitch — making the
  // touchline mapping explicit helps the reader connect lane to pitch.
  const sublabelKey =
    lane === 'left' ? 'leftSub' : lane === 'right' ? 'rightSub' : 'centerSub';
  return (
    <div className="flex items-baseline justify-between">
      <span className="font-headline font-bold text-[10px] uppercase tracking-widest text-primary">
        {t(lane)}
      </span>
      <span className="font-label text-[8px] tracking-widest uppercase text-outline">
        {t(sublabelKey)}
      </span>
    </div>
  );
}

function MetricCell({
  metric,
  active,
  lane,
  label,
}: {
  metric: Metric;
  active: MatchSnapshot;
  lane: Lane;
  label: string;
}) {
  const homeVal = active.h.ls?.[lane]?.[metric];
  const awayVal = active.a.ls?.[lane]?.[metric];
  const homeStr = formatVal(homeVal);
  const awayStr = formatVal(awayVal);
  return (
    <div
      className="flex items-center gap-2"
      data-testid={`metric-${metric}-${lane}`}
    >
      <span className="font-label text-[8px] tracking-widest uppercase text-outline w-7 shrink-0">
        {label}
      </span>
      <span
        className="font-headline font-black text-xs text-primary tabular-nums w-7 text-right shrink-0"
        data-testid={`metric-${metric}-${lane}-home`}
      >
        {homeStr}
      </span>
      <MirrorBar value={homeVal ?? 0} max={METRIC_BAR_MAX} side="home" />
      <div className="w-px h-2.5 bg-outline-variant/40 shrink-0" />
      <MirrorBar value={awayVal ?? 0} max={METRIC_BAR_MAX} side="away" />
      <span
        className="font-headline font-black text-xs text-secondary tabular-nums w-7 shrink-0"
        data-testid={`metric-${metric}-${lane}-away`}
      >
        {awayStr}
      </span>
    </div>
  );
}

function formatVal(v: number | undefined): string {
  if (v === undefined || Number.isNaN(v)) return '—';
  return v.toFixed(1);
}

/**
 * Mirrored bar — home grows from the left, away grows from the right.
 * Always rendered in the same row so the two bars line up vertically.
 * Width is `value / max` clamped to [0, 0.48] of the row width (the
 * remaining 4% is the visual divider in the middle).
 */
function MirrorBar({
  value,
  max,
  side,
}: {
  value: number;
  max: number;
  side: 'home' | 'away';
}) {
  const pct = Math.max(0, Math.min(1, value / max)) * 48;
  const isHome = side === 'home';
  const style: CSSProperties = {
    width: `${pct}%`,
    height: '4px',
  };
  return (
    <div className="flex-1 flex items-center">
      {isHome ? (
        <div
          className="bg-gradient-to-r from-primary to-primary/70 rounded-l-full"
          style={style}
          data-testid={`bar-home-${value.toFixed(1)}`}
        />
      ) : (
        <div
          className="bg-gradient-to-l from-secondary to-secondary/70 rounded-r-full ml-auto"
          style={style}
          data-testid={`bar-away-${value.toFixed(1)}`}
        />
      )}
    </div>
  );
}

// ============================================================================
// RatioSection — possession share / push success rate rows
// ============================================================================

function RatioSection({
  title,
  rows,
}: {
  title: string;
  rows: Array<{ lane: Lane; homeValue: number | null; awayValue: number | null }>;
}) {
  return (
    <div className="rounded-lg border border-surface-container-high bg-surface-container px-2.5 py-2">
      <div className="text-[9px] font-label uppercase tracking-widest text-outline mb-1.5">
        {title}
      </div>
      <div className="space-y-1">
        {rows.map((row) => (
          <RatioRow key={row.lane} {...row} />
        ))}
      </div>
    </div>
  );
}

function RatioRow({
  lane,
  homeValue,
  awayValue,
}: {
  lane: Lane;
  homeValue: number | null;
  awayValue: number | null;
}) {
  const t = useTranslations('matches.zone');
  // Missing data (null) renders as `—` for both sides — distinguishes
  // "no attacks yet" (push rate) / "no data" (legacy snapshots) from
  // "the team genuinely failed every push" (rate of 0).
  const homePct = homeValue === null ? '—' : `${Math.round(homeValue * 100)}%`;
  const awayPct = awayValue === null ? '—' : `${Math.round(awayValue * 100)}%`;
  const homeFrac = homeValue ?? 0.5;
  const awayFrac = awayValue ?? 1 - homeFrac;
  return (
    <div
      className="flex items-center gap-1.5"
      data-testid={`ratio-${lane}`}
    >
      <span className="font-label text-[8px] tracking-widest uppercase text-outline w-4 shrink-0">
        {t(lane).charAt(0)}
      </span>
      <span
        className="font-headline font-bold text-[10px] text-primary tabular-nums w-9 text-right shrink-0"
        data-testid={`ratio-${lane}-home`}
      >
        Home {homePct}
      </span>
      <div className="flex-1 h-1.5 rounded-full bg-surface-container-high overflow-hidden flex">
        <div
          className="bg-primary h-full transition-all duration-200"
          style={{ width: `${homeFrac * 100}%` }}
        />
        <div
          className="bg-secondary h-full transition-all duration-200"
          style={{ width: `${awayFrac * 100}%` }}
        />
      </div>
      <span
        className="font-headline font-bold text-[10px] text-secondary tabular-nums w-9 shrink-0"
        data-testid={`ratio-${lane}-away`}
      >
        {awayPct} Away
      </span>
    </div>
  );
}