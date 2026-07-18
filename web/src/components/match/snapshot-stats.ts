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
 * Home's share of possession in a lane, computed from each team's
 * possession strength in that lane (`ls.pos`) — the engine's
 * pre-battle strength estimate summed across all 11 starters.
 *
 * Formula: `home.ls.pos / (home.ls.pos + away.ls.pos)`. Symmetric
 * by construction (sums to 1.0).
 *
 * Why strength-based, not `lc.mpr` / observed: the simulator's
 * `lc.mpr` only increments on the WINNER of each midfield battle.
 * If one side never wins in a lane, its `mpr` stays 0 forever and
 * the share collapses to 100% / 0% — which is mathematically true
 * ("every battle was won by the other side") but UX-misleading
 * (a reader looking at "Home 100%" naturally concludes the home
 * team is dominant, when actually the engine just predicts a near
 * 50/50 split from team strength). Lane strengths are the right
 * input for a dashboard panel: they always have data, they're the
 * engine's strength model output, and they're stable across the
 * whole match (no small-sample noise from a few midfield battles).
 *
 * Falls back to `0.5` when neither side reports `ls.pos` for the
 * lane (e.g. legacy match pre-dating lane strengths). Returns `null`
 * when EITHER side is missing `ls` entirely so the panel can show
 * "—" instead of a misleading 50/50.
 */
export function lanePossessionShare(
  home: MatchSnapshotSide | undefined,
  away: MatchSnapshotSide | undefined,
  lane: Lane,
): number | null {
  // Either side missing `ls` → no data. The UI renders "—" instead
  // of a misleading 50/50 fallback so the reader can tell the data
  // isn't there.
  if (!home?.ls || !away?.ls) return null;
  const homePos = home.ls[lane]?.pos ?? 0;
  const awayPos = away.ls[lane]?.pos ?? 0;
  const total = homePos + awayPos;
  if (total <= 0) return 0.5;
  return homePos / total;
}

// ============================================================================
// computePushRate
// ============================================================================

/**
 * Push success rate for a lane on a side: `attack / (attack + opp.defense)`,
 * derived from each team's lane strength. Mirrors the engine's
 * `duelProbability(attPower, defPower)` model — push succeeds when
 * the attacker's `ls.atk` outweighs the defender's `ls.def`.
 *
 * Why strength-based, not `lc.pr`: the simulator's `lc.pr` only
 * accumulates when THIS side won the preceding midfield battle and
 * actually attempted a push. A side that never wins midfield battles
 * in a lane has `attempts === 0` for the whole match → the panel
 * shows "—" next to its bar, which readers find confusing because
 * the same row's home column has a real number. Lane strengths
 * always have data and represent the engine's strength model.
 *
 * Returns `null` when either side is missing `ls` entirely (legacy
 * match). Falls back to `0` only when BOTH sides are at zero
 * (impossible in practice but defensive against divide-by-zero).
 */
export function computePushRate(
  snapshot: MatchSnapshot,
  lane: Lane,
  side: 'h' | 'a',
): number | null {
  const me = side === 'h' ? snapshot.h : snapshot.a;
  const opp = side === 'h' ? snapshot.a : snapshot.h;
  if (!me?.ls || !opp?.ls) return null;
  const myAtk = me.ls[lane]?.atk ?? 0;
  const oppDef = opp.ls[lane]?.def ?? 0;
  const total = myAtk + oppDef;
  if (total <= 0) return 0;
  return myAtk / total;
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