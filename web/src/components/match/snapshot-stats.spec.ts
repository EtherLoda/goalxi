/**
 * snapshot-stats.spec.ts — coverage for the snapshot-driven zone panel
 * helpers in `snapshot-stats.ts`.
 *
 * Pure data layer — no React, no fetch. These helpers read the
 * engine-emitted `lc.pr` (push probability) and `lc.mpr` (midfield
 * probability) directly — no client-side division. See
 * `simulator/src/engine/match.engine.ts:2805` for the engine side.
 */

import type { MatchEvent } from '@/lib/api';
import {
  extractSnapshots,
  lanePossessionShare,
  computePushRate,
  shouldCommitScrubber,
} from './snapshot-stats';
import type {
  MatchSnapshot,
  MatchSnapshotSide,
  SnapshotLaneStrengths,
  SnapshotLaneCounters,
} from './match-pitch-data';

// ============================================================================
// Fixtures
// ============================================================================

function mkLs(pos: number): SnapshotLaneStrengths {
  return {
    left: { atk: pos, def: pos, pos },
    center: { atk: pos, def: pos, pos },
    right: { atk: pos, def: pos, pos },
  };
}

/** Lane strengths with per-phase values, for the strength-based
 *  possession-share / push-rate specs. */
function mkLsPhased(values: {
  left: { atk: number; def: number; pos: number };
  center: { atk: number; def: number; pos: number };
  right: { atk: number; def: number; pos: number };
}): SnapshotLaneStrengths {
  return values;
}

function mkLc(att: number, pr: number, mpr: number): SnapshotLaneCounters {
  return {
    left: { att, ps_: 0, pr, mpr },
    center: { att, ps_: 0, pr, mpr },
    right: { att, ps_: 0, pr, mpr },
  };
}

function mkSnapshotEvent(
  minute: number,
  homeLs: SnapshotLaneStrengths,
  homeLc: SnapshotLaneCounters,
  awayLs: SnapshotLaneStrengths,
  awayLc: SnapshotLaneCounters,
): MatchEvent {
  return {
    id: `snap-${minute}`,
    matchId: 'm-1',
    minute,
    second: 0,
    type: 'SNAPSHOT',
    typeName: 'SNAPSHOT',
    data: {
      h: { ls: homeLs, lc: homeLc, gk: 80, ps: [] },
      a: { ls: awayLs, lc: awayLc, gk: 80, ps: [] },
    },
  } as unknown as MatchEvent;
}

// ============================================================================
// extractSnapshots
// ============================================================================

describe('extractSnapshots', () => {
  it('returns [] when there are no SNAPSHOT events', () => {
    const events: MatchEvent[] = [
      { id: '1', matchId: 'm-1', minute: 5, type: 'GOAL', typeName: 'GOAL' } as unknown as MatchEvent,
    ];
    expect(extractSnapshots(events)).toEqual([]);
  });

  it('returns snapshots in chronological order, ignoring non-snapshot events', () => {
    const events = [
      mkSnapshotEvent(15, mkLs(50), mkLc(2, 0.5, 0.6), mkLs(50), mkLc(1, 0.5, 0.4)),
      { id: 'g', matchId: 'm-1', minute: 12, type: 'GOAL', typeName: 'GOAL' } as unknown as MatchEvent,
      mkSnapshotEvent(5, mkLs(40), mkLc(0, 0, 0), mkLs(40), mkLc(0, 0, 0)),
      mkSnapshotEvent(35, mkLs(60), mkLc(4, 0.7, 0.55), mkLs(40), mkLc(3, 0.4, 0.45)),
    ];
    const out = extractSnapshots(events);
    expect(out.map((s) => s.minute)).toEqual([5, 15, 35]);
  });

  it('handles typeName === type fallback (older event shapes)', () => {
    // Some server responses carry only `type` and no `typeName`. Both
    // forms must yield the same snapshot.
    const legacy = {
      id: 'snap',
      matchId: 'm-1',
      minute: 30,
      type: 'snapshot',
      data: {
        h: { ls: mkLs(50), lc: mkLc(1, 0.6, 0.55), gk: 80, ps: [] },
        a: { ls: mkLs(40), lc: mkLc(1, 0.4, 0.45), gk: 80, ps: [] },
      },
    } as unknown as MatchEvent;
    expect(extractSnapshots([legacy])).toHaveLength(1);
  });

  it('skips snapshot events whose data has no home/away payload', () => {
    const incomplete = {
      id: 'snap',
      matchId: 'm-1',
      minute: 30,
      type: 'SNAPSHOT',
      typeName: 'SNAPSHOT',
      data: { h: { ls: mkLs(50), lc: mkLc(0, 0, 0), gk: 80, ps: [] } },
    } as unknown as MatchEvent;
    expect(extractSnapshots([incomplete])).toEqual([]);
  });

  it('does not mutate the input events array', () => {
    const events = [
      mkSnapshotEvent(35, mkLs(50), mkLc(0, 0, 0), mkLs(50), mkLc(0, 0, 0)),
      mkSnapshotEvent(5, mkLs(50), mkLc(0, 0, 0), mkLs(50), mkLc(0, 0, 0)),
    ];
    const before = events.map((e) => e.minute);
    extractSnapshots(events);
    expect(events.map((e) => e.minute)).toEqual(before);
  });
});

// ============================================================================
// lanePossessionShare
// ============================================================================

describe('lanePossessionShare', () => {
  // Possession share is derived from each team's lane possession
  // STRENGTH (`ls.pos`), not from observed wins (`lc.midfieldBattles`)
  // or expected midfield probability (`lc.mpr`). Reason: strengths
  // always have data; the battle-derived fields collapse to 0/0 or
  // 1.0/0 depending on RNG.
  const home = mkLsPhased({
    left:   { atk: 600, def: 400, pos: 600 },
    center: { atk: 700, def: 500, pos: 700 },
    right:  { atk: 500, def: 600, pos: 500 },
  });
  const away = mkLsPhased({
    left:   { atk: 400, def: 600, pos: 400 },
    center: { atk: 500, def: 700, pos: 500 },
    right:  { atk: 600, def: 500, pos: 600 },
  });

  it("returns home's strength-based possession share (sums to 1.0 with the away call)", () => {
    // left: 600 / (600 + 400) = 0.6
    expect(lanePossessionShare({ ls: home, ps: [] } as MatchSnapshotSide, { ls: away, ps: [] } as MatchSnapshotSide, 'left')).toBeCloseTo(0.6, 5);
    // center: 700 / (700 + 500) ≈ 0.5833
    expect(lanePossessionShare({ ls: home, ps: [] } as MatchSnapshotSide, { ls: away, ps: [] } as MatchSnapshotSide, 'center')).toBeCloseTo(0.5833, 4);
    // right: 500 / (500 + 600) ≈ 0.4545
    expect(lanePossessionShare({ ls: home, ps: [] } as MatchSnapshotSide, { ls: away, ps: [] } as MatchSnapshotSide, 'right')).toBeCloseTo(0.4545, 4);
  });

  it('symmetric: homeShare + awayShare === 1', () => {
    for (const lane of ['left', 'center', 'right'] as const) {
      const h = lanePossessionShare({ ls: home, ps: [] } as MatchSnapshotSide, { ls: away, ps: [] } as MatchSnapshotSide, lane);
      const a = lanePossessionShare({ ls: away, ps: [] } as MatchSnapshotSide, { ls: home, ps: [] } as MatchSnapshotSide, lane);
      expect(h).not.toBeNull();
      expect(a).not.toBeNull();
      expect((h as number) + (a as number)).toBeCloseTo(1, 5);
    }
  });

  it('returns 0.5 when both sides have 0 pos strength (defensive fallback)', () => {
    const empty = mkLsPhased({
      left:   { atk: 0, def: 0, pos: 0 },
      center: { atk: 0, def: 0, pos: 0 },
      right:  { atk: 0, def: 0, pos: 0 },
    });
    expect(
      lanePossessionShare(
        { ls: empty, ps: [] } as MatchSnapshotSide,
        { ls: empty, ps: [] } as MatchSnapshotSide,
        'center',
      ),
    ).toBe(0.5);
  });

  it('returns null when either side is missing `ls` entirely (legacy snapshots)', () => {
    const homeNoLs = { ls: undefined, ps: [] } as unknown as MatchSnapshotSide;
    expect(
      lanePossessionShare(homeNoLs, { ls: away, ps: [] } as MatchSnapshotSide, 'left'),
    ).toBeNull();
  });

  it('returns null when away side has ls missing (legacy snapshots)', () => {
    const awayNoLs = { ls: undefined, ps: [] } as unknown as MatchSnapshotSide;
    expect(
      lanePossessionShare({ ls: home, ps: [] } as MatchSnapshotSide, awayNoLs, 'center'),
    ).toBeNull();
  });

  it('returns a plausible share even when one side has 0 attempts in this lane (no 0/100 collapse)', () => {
    // Reproduces the production bug: a side that never attacks in a
    // lane should still get a plausible share based on team strength,
    // not a degenerate 100/0 from the formula's divide-by-zero path.
    const homeNoRight = mkLsPhased({
      left:   { atk: 600, def: 400, pos: 600 },
      center: { atk: 700, def: 500, pos: 700 },
      right:  { atk: 500, def: 600, pos: 0 }, // pos=0 for "no data"
    });
    const awayNoRight = mkLsPhased({
      left:   { atk: 400, def: 600, pos: 400 },
      center: { atk: 500, def: 700, pos: 500 },
      right:  { atk: 600, def: 500, pos: 0 },
    });
    // Both pos=0 → defensive 0.5 fallback (NEVER 1.0/0.0)
    expect(
      lanePossessionShare(
        { ls: homeNoRight, ps: [] } as MatchSnapshotSide,
        { ls: awayNoRight, ps: [] } as MatchSnapshotSide,
        'right',
      ),
    ).toBe(0.5);
  });
});

// ============================================================================
// computePushRate
// ============================================================================

describe('computePushRate', () => {
  // Real scenario: home atk=600 in left lane, away def=400.
  // Formula: home.ls.left.atk / (home.ls.left.atk + away.ls.left.def)
  //         = 600 / (600 + 400) = 0.6.
  // Note: `oppDef` is the OPPONENT's `ls[lane].def`, not their atk —
  // a push fails against the defender's defense strength, not their
  // attack strength.
  const snap: MatchSnapshot = {
    minute: 30,
    h: {
      ls: mkLsPhased({
        left:   { atk: 600, def: 400, pos: 600 },
        center: { atk: 400, def: 600, pos: 600 },
        right:  { atk: 500, def: 500, pos: 500 },
      }),
      ps: [],
    },
    a: {
      ls: mkLsPhased({
        // Home atk=600 vs away def=400 → 0.6 home push success.
        left:   { atk: 400, def: 400, pos: 400 },
        // Home atk=400 vs away def=600 → 0.4 home push success.
        center: { atk: 600, def: 600, pos: 500 },
        // Both sides atk=def=500 → 0.5 (balanced).
        right:  { atk: 500, def: 500, pos: 500 },
      }),
      ps: [],
    },
  };

  it('returns home atk / (home atk + away def) — strength-based prediction', () => {
    // home pushes in `left`: home.atk=600 vs away.def=400 → 600/1000=0.6
    expect(computePushRate(snap, 'left', 'h')).toBeCloseTo(0.6, 5);
    // home pushes in `center`: home.atk=400 vs away.def=600 → 400/1000=0.4
    expect(computePushRate(snap, 'center', 'h')).toBeCloseTo(0.4, 5);
    // away pushes in `left`: away.atk=400 vs home.def=400 → 400/800=0.5
    expect(computePushRate(snap, 'left', 'a')).toBeCloseTo(0.5, 5);
    // away pushes in `center`: away.atk=600 vs home.def=600 → 600/1200=0.5
    expect(computePushRate(snap, 'center', 'a')).toBeCloseTo(0.5, 5);
  });

  it('returns 0.5 when both sides are perfectly balanced (atk === def)', () => {
    expect(computePushRate(snap, 'right', 'h')).toBeCloseTo(0.5, 5);
    expect(computePushRate(snap, 'right', 'a')).toBeCloseTo(0.5, 5);
  });

  it('returns a plausible rate even when one side never attacked in this lane (no "—" bug)', () => {
    // Reproduces the production bug: away right lane has atk=0 (no
    // recorded push attempts historically). Old formula returned null
    // ("—"); new formula still gives a strength-based prediction.
    const scenario: MatchSnapshot = {
      minute: 30,
      h: {
        ls: mkLsPhased({
          left:   { atk: 600, def: 400, pos: 600 },
          center: { atk: 400, def: 600, pos: 600 },
          right:  { atk: 500, def: 500, pos: 500 },
        }),
        ps: [],
      },
      a: {
        ls: mkLsPhased({
          left:   { atk: 400, def: 600, pos: 400 },
          center: { atk: 600, def: 400, pos: 500 },
          right:  { atk: 0,   def: 500, pos: 500 },
        }),
        ps: [],
      },
    };
    // away right: 0 / (0 + 500) = 0 (legitimately low — never attacks)
    expect(computePushRate(scenario, 'right', 'a')).toBeCloseTo(0, 5);
    // home right stays balanced: 500/1000 = 0.5
    expect(computePushRate(scenario, 'right', 'h')).toBeCloseTo(0.5, 5);
  });

  it('returns null when ls is missing on either side (legacy snapshots)', () => {
    const legacy: MatchSnapshot = {
      minute: 0,
      h: { ls: undefined, ps: [] } as unknown as MatchSnapshotSide,
      a: { ls: mkLs(50), ps: [] } as MatchSnapshotSide,
    };
    expect(computePushRate(legacy, 'left', 'h')).toBeNull();
  });
});

// ============================================================================
// shouldCommitScrubber
// ============================================================================

describe('shouldCommitScrubber', () => {
  it('returns null when no draft is in flight (mouseup without prior change)', () => {
    // Native browser fires mouseup on the input even if the value
    // didn't change. The commit must skip in that case.
    expect(shouldCommitScrubber(null, 5)).toBeNull();
  });

  it('returns null when the draft equals the active index (no-op click)', () => {
    // User drags to the same tick and releases — no commit, no re-render.
    expect(shouldCommitScrubber(3, 3)).toBeNull();
  });

  it('returns the draft index when it differs from active (real drag/click)', () => {
    expect(shouldCommitScrubber(5, 3)).toBe(5);
    expect(shouldCommitScrubber(0, 7)).toBe(0);
  });

  it('boundary case: dragging to the very last snapshot commits', () => {
    expect(shouldCommitScrubber(17, 5)).toBe(17);
  });
});