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
  // Helper that wires lc.mpr per lane — the engine emits the expected
  // midfield win probability, not the strength.
  const sideWithMpr = (mpr: {
    left: number;
    center: number;
    right: number;
  }): MatchSnapshotSide =>
    ({
      ls: mkLs(50),
      lc: {
        left: { att: 10, ps_: 0, pr: 0.5, mpr: mpr.left },
        center: { att: 10, ps_: 0, pr: 0.5, mpr: mpr.center },
        right: { att: 10, ps_: 0, pr: 0.5, mpr: mpr.right },
      },
      ps: [],
    } as MatchSnapshotSide);

  it("returns home's expected win share (sums to 1.0 with the away call)", () => {
    const home = sideWithMpr({ left: 0.6, center: 0.5, right: 0.3 });
    const away = sideWithMpr({ left: 0.4, center: 0.5, right: 0.7 });
    expect(lanePossessionShare(home, away, 'left')).toBeCloseTo(0.6, 5);
    expect(lanePossessionShare(home, away, 'center')).toBeCloseTo(0.5, 5);
    expect(lanePossessionShare(home, away, 'right')).toBeCloseTo(0.3, 5);
  });

  it('symmetric: homeShare + awayShare === 1', () => {
    const home = sideWithMpr({ left: 0.6, center: 0.5, right: 0.3 });
    const away = sideWithMpr({ left: 0.4, center: 0.5, right: 0.7 });
    for (const lane of ['left', 'center', 'right'] as const) {
      const h = lanePossessionShare(home, away, lane);
      const a = lanePossessionShare(away, home, lane);
      expect(h).not.toBeNull();
      expect(a).not.toBeNull();
      expect((h as number) + (a as number)).toBeCloseTo(1, 5);
    }
  });

  it('returns 0.5 when both sides have 0 mpr (no data)', () => {
    const emptyHome = sideWithMpr({ left: 0, center: 0, right: 0 });
    const emptyAway = sideWithMpr({ left: 0, center: 0, right: 0 });
    expect(lanePossessionShare(emptyHome, emptyAway, 'center')).toBe(0.5);
  });

  it('returns null when either side is missing `lc` entirely (legacy snapshots)', () => {
    const home = { ps: [] } as MatchSnapshotSide;
    const away = sideWithMpr({ left: 0.3, center: 0.3, right: 0.3 });
    // Missing home `lc` → no data → null, NOT a misleading 0% / 50%.
    expect(lanePossessionShare(home, away, 'left')).toBeNull();
  });

  it('returns null when away side has lane data missing (legacy snapshots)', () => {
    const home = sideWithMpr({ left: 0.3, center: 0.3, right: 0.3 });
    const away = { ls: undefined, ps: [] } as MatchSnapshotSide;
    expect(lanePossessionShare(home, away, 'center')).toBeNull();
  });
});

// ============================================================================
// computePushRate
// ============================================================================

describe('computePushRate', () => {
  const snap: MatchSnapshot = {
    minute: 30,
    h: {
      ls: mkLs(60),
      lc: {
        left: { att: 10, ps_: 0, pr: 0.6, mpr: 0.5 },
        center: { att: 5, ps_: 0, pr: 0.4, mpr: 0.5 },
        right: { att: 0, ps_: 0, pr: 0, mpr: 0 },
      },
      ps: [],
    },
    a: {
      ls: mkLs(40),
      lc: {
        left: { att: 8, ps_: 0, pr: 0.5, mpr: 0.5 },
        center: { att: 5, ps_: 0, pr: 0.6, mpr: 0.5 },
        right: { att: 0, ps_: 0, pr: 0, mpr: 0 },
      },
      ps: [],
    },
  };

  it("returns the engine's pr (push probability) directly — no division", () => {
    expect(computePushRate(snap, 'left', 'h')).toBeCloseTo(0.6, 5);
    expect(computePushRate(snap, 'left', 'a')).toBeCloseTo(0.5, 5);
    expect(computePushRate(snap, 'center', 'h')).toBeCloseTo(0.4, 5);
    expect(computePushRate(snap, 'center', 'a')).toBeCloseTo(0.6, 5);
  });

  it('returns null when no attacks have happened (avoids 0/0)', () => {
    expect(computePushRate(snap, 'right', 'h')).toBeNull();
    expect(computePushRate(snap, 'right', 'a')).toBeNull();
  });

  it('returns null when lc is missing on the side (legacy snapshots)', () => {
    const legacy: MatchSnapshot = {
      minute: 0,
      h: { ls: mkLs(50), ps: [] } as MatchSnapshotSide,
      a: { ls: mkLs(50), ps: [] } as MatchSnapshotSide,
    };
    expect(computePushRate(legacy, 'left', 'h')).toBeNull();
  });

  it('rate is 0 when att > 0 but engine-emitted pr === 0 (every push expected to fail)', () => {
    const allFailed: MatchSnapshot = {
      ...snap,
      h: {
        ...snap.h,
        lc: {
          left: { att: 5, ps_: 0, pr: 0, mpr: 0.5 },
          center: { att: 5, ps_: 0, pr: 0, mpr: 0.5 },
          right: { att: 5, ps_: 0, pr: 0, mpr: 0.5 },
        },
      },
    };
    expect(computePushRate(allFailed, 'left', 'h')).toBe(0);
  });

  // [RFC snapshot-prob] Regression: a 1-attempt / 1-success empirical rate
  // would render 100% on the FE; reading pr from the engine output keeps
  // the rate stable regardless of how many pushes have happened.
  it('rate is stable across small samples (engine output, not ps_/att)', () => {
    const tinySample: MatchSnapshot = {
      ...snap,
      h: {
        ...snap.h,
        lc: {
          left: { att: 1, ps_: 1, pr: 0.42, mpr: 0.5 },
          center: { att: 1, ps_: 1, pr: 0.42, mpr: 0.5 },
          right: { att: 1, ps_: 1, pr: 0.42, mpr: 0.5 },
        },
      },
    };
    // Old behavior would have returned 1.0 (1/1). Now the engine's
    // 0.42 expected probability wins — small samples don't dominate.
    expect(computePushRate(tinySample, 'left', 'h')).toBeCloseTo(0.42, 5);
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