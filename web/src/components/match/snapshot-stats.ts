/**
 * snapshot-stats.ts — pure helpers for the snapshot-driven zone panel.
 *
 * Lives in `.ts` (not `.tsx`) so jest's `moduleFileExtensions` resolves it.
 * Owns:
 *   - `extractSnapshots(events)` — walks a `MatchEvent[]`, returns every
 *     SNAPSHOT event in chronological order, with the full side payloads
 *     (`ls`, `lc`, `ps`, `gk`, `n`) attached.
 *   - `lanePosSessionShare(home, away, lane)` — returns home's share of
 *     possession strength for a given lane, in [0, 1]. Symmetric:
 *     `homeShare + awayShare === 1`.
 *   - `computePushRate(snapshot, lane, side)` — returns `ps_ / att` for
 *     the given lane and side, or `null` when no attacks have happened
 *     yet (avoids divide-by-zero and signals "no data" to the UI).
 *
 * All helpers are pure: no React, no fetch. The simulator owns the
 * formula for these (see `simulator/src/engine/match.engine.ts` +
 * `duel.ts`) — this module mirrors it on the FE side.
 */

import type { MatchEvent } from '@/lib/api';
import type {
  MatchSnapshot,
  MatchSnapshotSide,
  Lane,
} from './match-pitch-data';

// ============================================================================
// extractSnapshots
// ============================================================================

/**
 * Walk `events` and return every SNAPSHOT event in chronological order,
 * normalized to the `MatchSnapshot` shape `MatchPitch` and the zone panel
 * consume. Older matches that lack `ls`/`lc` still come through (the
 * fields are optional on `MatchSnapshotSide`).
 *
 * Pure function — does not mutate the input. Safe to call inside
 * `useMemo` in the page component.
 *
 * Pre-condition: events come from `api.matches.getEvents(matchId)` and
 * have already been typed by the API client. If the FE ever ingests a
 * pre-typed array, this filter is the only normalization needed.
 */
export function extractSnapshots(events: MatchEvent[]): MatchSnapshot[] {
  const out: MatchSnapshot[] = [];
  for (const e of events) {
    const typeName = (e.typeName || (e as { type?: string }).type || '')
      .toString()
      .toUpperCase();
    if (typeName !== 'SNAPSHOT') continue;
    const data = (e as { data?: { h?: unknown; a?: unknown } }).data;
    if (!data) continue;
    const home = data.h as MatchSnapshotSide | undefined;
    const away = data.a as MatchSnapshotSide | undefined;
    if (!home || !away) continue;
    out.push({
      minute: e.minute,
      h: home,
      a: away,
    });
  }
  // Snapshots are already emitted in chronological order by the
  // simulator, but sort defensively so the scrubber never desyncs.
  out.sort((a, b) => a.minute - b.minute);
  return out;
}

// ============================================================================
// lanePosSessionShare
// ============================================================================

/**
 * Home's share of possession strength in a lane, derived from the
 * simulator's expected midfield win probability `mpr` (mean of
 * `duelProbability(homeControl, awayControl, ...)` across every
 * midfield battle in this lane — emitted by the engine, not derived
 * from empirical counters). Symmetric by construction:
 * `lanePossessionShare(h, a, lane) + lanePossessionShare(a, h, lane) === 1`.
 *
 * Falls back to `0.5` when both teams report 0 in the lane (e.g. t=0
 * snapshot with no battles fought yet) — matches the "no data, show
 * neutral" convention used elsewhere in the panel.
 */
export function lanePossessionShare(
  home: MatchSnapshotSide | undefined,
  away: MatchSnapshotSide | undefined,
  lane: Lane,
): number | null {
  // Either side missing `lc` → no data. The UI renders "—" instead of a
  // misleading 0% / 50% so the reader can tell the data isn't there.
  if (!home?.lc || !away?.lc) return null;
  const homeMpr = home.lc[lane]?.mpr ?? 0;
  const awayMpr = away.lc[lane]?.mpr ?? 0;
  const total = homeMpr + awayMpr;
  if (total <= 0) return 0.5;
  return homeMpr / total;
}

// ============================================================================
// computePushRate
// ============================================================================

/**
 * Push success rate for a lane on a side, read directly from the
 * simulator's `lc.pr` (mean of `duelProbability(attPower, defPower)`
 * across every push duel in this lane). The engine is the source of
 * truth for this value — the FE does no division, so the rate stays
 * stable regardless of how many pushes have happened so far.
 *
 * Returns `null` when no pushes have happened yet on that side/lane
 * (engine emits `pr=0` but we want the UI to render "—" rather than
 * "0%" to distinguish "no data" from "team really is at 0% expected").
 */
export function computePushRate(
  snapshot: MatchSnapshot,
  lane: Lane,
  side: 'h' | 'a',
): number | null {
  const counters = side === 'h' ? snapshot.h.lc : snapshot.a.lc;
  const cell = counters?.[lane];
  if (!cell || cell.att === 0) return null;
  return cell.pr;
}

// ============================================================================
// shouldCommitScrubber
// ============================================================================

/**
 * Decide whether the snapshot scrubber should commit a draft to the
 * parent's `activeIndex` on release. Pure — extracted so the component
 * can stay focused on rendering, and so the "no-op click on the same
 * tick" rule has a covering spec without spinning up jsdom + RTL.
 *
 * Rules:
 *   - No draft in flight (mouseup fired without prior change event) → no commit
 *   - Draft equals active index (user released on the same tick) → no commit
 *   - Otherwise → commit, return the draft as the new index
 *
 * Returns `null` when there's nothing to commit (matches the component's
 * "skip onCommit" branch). Returns the new index when commit fires.
 */
export function shouldCommitScrubber(
  draftIndex: number | null,
  activeIndex: number,
): number | null {
  if (draftIndex === null) return null;
  if (draftIndex === activeIndex) return null;
  return draftIndex;
}