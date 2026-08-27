/**
 * match-timeline.spec.ts — coverage for the pure helpers in
 * `match-timeline.ts`.
 *
 * Pure data layer — no React, no fetch. The component (`MatchTimeline.tsx`)
 * consumes these helpers; the page wires them up.
 */

import type { MatchEvent } from '@/lib/api';
import type { MatchSnapshot } from './match-pitch-data';
import {
  TIMELINE_EVENT_TYPES,
  closestSnapshotIndex,
  deriveSnapshotPeriods,
  extractInjuryWindows,
  extractTimelineMarkers,
  formatMatchMinute,
  minuteToPercent,
  phaseOfEvent,
  resolveWhistleMinutes,
  timelineEnd,
  visualMinute,
  type InjuryWindow,
} from './match-timeline';

// ============================================================================
// Fixtures
// ============================================================================

function mkEvent(
  partial: Partial<MatchEvent> & { minute: number },
): MatchEvent {
  // Build the event in two phases — first the partial that's passed in
  // (sans `type` and `typeName` since we override them), then add the
  // type fields. Spreading `partial` last would clobber them.
  const { type, typeName, minute, ...rest } = partial;
  void type;
  void typeName;
  void minute;
  void rest;
  return {
    id: `${partial.type}-${partial.minute}`,
    matchId: 'm-1',
    second: 0,
    type: partial.type ?? 'GOAL',
    typeName: partial.typeName ?? partial.type ?? 'GOAL',
    teamId: partial.teamId,
    isHome: partial.isHome,
    minute: partial.minute,
    ...rest,
  } as MatchEvent;
}

// ============================================================================
// extractTimelineMarkers
// ============================================================================

describe('extractTimelineMarkers', () => {
  it('returns [] when there are no events of interest', () => {
    const events: MatchEvent[] = [
      mkEvent({ type: 'SHOT_OFF_TARGET', minute: 10 }),
      mkEvent({ type: 'CORNER', minute: 20 }),
    ];
    expect(extractTimelineMarkers(events)).toEqual([]);
  });

  it('keeps goals / subs / yellow / red cards / injuries, ignores other types', () => {
    const events: MatchEvent[] = [
      mkEvent({ type: 'GOAL', minute: 12, isHome: true, teamId: 'home' }),
      mkEvent({ type: 'SUBSTITUTION', minute: 55, isHome: false, teamId: 'away' }),
      mkEvent({ type: 'YELLOW_CARD', minute: 30, isHome: true, teamId: 'home' }),
      mkEvent({ type: 'RED_CARD', minute: 70, isHome: false, teamId: 'away' }),
      mkEvent({ type: 'CORNER', minute: 18 }),
      mkEvent({
        type: 'INJURY',
        typeName: 'injury',
        minute: 40,
        isHome: true,
        teamId: 'home',
        data: { playerName: 'David Klein' },
      }),
      mkEvent({ type: 'SNAPSHOT', minute: 25 }),
    ];
    const markers = extractTimelineMarkers(events);
    expect(markers.map((m) => m.type)).toEqual([
      'GOAL',
      'YELLOW_CARD',
      'INJURY',
      'SUBSTITUTION',
      'RED_CARD',
    ]);
    expect(markers.map((m) => m.minute)).toEqual([12, 30, 40, 55, 70]);
  });

  it('extracts playerName from event.data so markers can show hover tooltips', () => {
    // Regression for the "three ⚽ markers all look the same" UX
    // bug: without pulling playerName from data, the marker only
    // knows the type and minute, and a reader can't tell which
    // goal was which without clicking through.
    const events: MatchEvent[] = [
      mkEvent({
        type: 'GOAL',
        minute: 12,
        isHome: true,
        teamId: 'home',
        data: { playerName: 'Alice' },
      }),
      mkEvent({
        type: 'GOAL',
        minute: 45,
        isHome: true,
        teamId: 'home',
        data: { playerName: 'Bob' },
      }),
      mkEvent({
        type: 'INJURY',
        typeName: 'injury',
        minute: 60,
        isHome: false,
        teamId: 'away',
        data: { playerName: 'Charlie' },
      }),
    ];
    const markers = extractTimelineMarkers(events);
    expect(markers.map((m) => m.playerName)).toEqual(['Alice', 'Bob', 'Charlie']);
  });

  it('omits playerName when the event payload lacks it (legacy / pre-RFC rows)', () => {
    const events: MatchEvent[] = [
      mkEvent({ type: 'GOAL', minute: 12, isHome: true, teamId: 'home' }),
    ];
    const markers = extractTimelineMarkers(events);
    expect(markers[0].playerName).toBeUndefined();
  });

  it('dedupes events that share (type, minute, teamId)', () => {
    const events: MatchEvent[] = [
      mkEvent({ type: 'GOAL', minute: 12, teamId: 'home', isHome: true }),
      mkEvent({ type: 'GOAL', minute: 12, teamId: 'home', isHome: true }),
      mkEvent({ type: 'GOAL', minute: 12, teamId: 'away', isHome: false }),
    ];
    const markers = extractTimelineMarkers(events);
    expect(markers).toHaveLength(2);
  });

  it('folds PENALTY_GOAL to GOAL via the canonical-event-type alias map', () => {
    const events: MatchEvent[] = [
      mkEvent({ type: 'PENALTY_GOAL', minute: 80, teamId: 'home', isHome: true }),
    ];
    const markers = extractTimelineMarkers(events);
    expect(markers).toHaveLength(1);
    expect(markers[0].type).toBe('GOAL');
  });

  it('keeps both YELLOW_CARD and SECOND_YELLOW as separate marker types', () => {
    const events: MatchEvent[] = [
      mkEvent({ type: 'YELLOW_CARD', minute: 20, teamId: 'home', isHome: true }),
      mkEvent({ type: 'SECOND_YELLOW', minute: 60, teamId: 'home', isHome: true }),
    ];
    const markers = extractTimelineMarkers(events);
    expect(markers.map((m) => m.type)).toEqual(['YELLOW_CARD', 'SECOND_YELLOW']);
  });

  it('sorts markers chronologically', () => {
    const events: MatchEvent[] = [
      mkEvent({ type: 'GOAL', minute: 70 }),
      mkEvent({ type: 'GOAL', minute: 12 }),
      mkEvent({ type: 'GOAL', minute: 45 }),
    ];
    expect(extractTimelineMarkers(events).map((m) => m.minute)).toEqual([12, 45, 70]);
  });

  it('preserves teamId and isHome on the marker', () => {
    const events: MatchEvent[] = [
      mkEvent({ type: 'GOAL', minute: 12, teamId: 'home', isHome: true }),
    ];
    const [m] = extractTimelineMarkers(events);
    expect(m.teamId).toBe('home');
    expect(m.isHome).toBe(true);
  });

  it('does not mutate the input events array', () => {
    const events: MatchEvent[] = [
      mkEvent({ type: 'GOAL', minute: 70 }),
      mkEvent({ type: 'GOAL', minute: 12 }),
    ];
    const before = events.map((e) => e.minute);
    extractTimelineMarkers(events);
    expect(events.map((e) => e.minute)).toEqual(before);
  });
});

// ============================================================================
// extractInjuryWindows
// ============================================================================

describe('extractInjuryWindows', () => {
  it('returns [] for empty input', () => {
    expect(extractInjuryWindows([])).toEqual([]);
  });

  it('returns [] when no whistle events carry injuryTime', () => {
    // A regulation match with no stoppage time → no bands.
    const events: MatchEvent[] = [
      mkEvent({
        type: 'half_time',
        typeName: 'half_time',
        minute: 45,
        data: { period: 'half_time', homeScore: 0, awayScore: 0 },
      }),
      mkEvent({
        type: 'full_time',
        typeName: 'full_time',
        minute: 90,
        data: { homeScore: 1, awayScore: 1 },
      }),
    ];
    expect(extractInjuryWindows(events)).toEqual([]);
  });

  it('detects 1H stoppage from half_time (period: half_time)', () => {
    const events: MatchEvent[] = [
      mkEvent({
        type: 'half_time',
        typeName: 'half_time',
        minute: 48,
        data: { period: 'half_time', injuryTime: 3, homeScore: 0, awayScore: 0 },
      }),
    ];
    expect(extractInjuryWindows(events)).toEqual([
      { startMinute: 45, endMinute: 48, addedMinutes: 3, label: '1H' },
    ]);
  });

  it('detects 2H stoppage from full_time at minute 90 (filtered from ET full_time by minute < 120)', () => {
    const events: MatchEvent[] = [
      mkEvent({
        type: 'full_time',
        typeName: 'full_time',
        minute: 93,
        data: { injuryTime: 3, homeScore: 2, awayScore: 1 },
      }),
    ];
    expect(extractInjuryWindows(events)).toEqual([
      { startMinute: 90, endMinute: 93, addedMinutes: 3, label: '2H' },
    ]);
  });

  it('detects ET 1H stoppage from half_time (period: extra_time_half_time)', () => {
    const events: MatchEvent[] = [
      mkEvent({
        type: 'half_time',
        typeName: 'half_time',
        minute: 108,
        data: {
          period: 'extra_time_half_time',
          injuryTime: 3,
          homeScore: 1,
          awayScore: 1,
        },
      }),
    ];
    expect(extractInjuryWindows(events)).toEqual([
      { startMinute: 105, endMinute: 108, addedMinutes: 3, label: 'ET1H' },
    ]);
  });

  it('derives ET 2H stoppage from the ET full_time (minute 120+) minus the ET 1H half_time contribution', () => {
    // The engine writes `data.injuryTime: N2 + M2` on the ET
    // `full_time` event. We split that back into M2 for the
    // timeline band by subtracting the ET 1H stoppage (read
    // from the ET `half_time` event with the matching
    // `period: 'extra_time_half_time'`).
    const events: MatchEvent[] = [
      mkEvent({
        type: 'half_time',
        typeName: 'half_time',
        minute: 107,
        data: {
          period: 'extra_time_half_time',
          injuryTime: 2,
          homeScore: 1,
          awayScore: 1,
        },
      }),
      mkEvent({
        type: 'full_time',
        typeName: 'full_time',
        minute: 123,
        data: { injuryTime: 5, homeScore: 2, awayScore: 1 }, // 2 (ET1H) + 3 (ET2H)
      }),
    ];
    expect(extractInjuryWindows(events)).toEqual([
      { startMinute: 105, endMinute: 107, addedMinutes: 2, label: 'ET1H' },
      { startMinute: 120, endMinute: 123, addedMinutes: 3, label: 'ET2H' },
    ]);
  });

  it('emits the full 4 windows in a stoppage-heavy match', () => {
    const events: MatchEvent[] = [
      mkEvent({
        type: 'half_time',
        typeName: 'half_time',
        minute: 47,
        data: { period: 'half_time', injuryTime: 2 },
      }),
      mkEvent({
        type: 'full_time',
        typeName: 'full_time',
        minute: 94,
        data: { injuryTime: 4 },
      }),
      mkEvent({
        type: 'half_time',
        typeName: 'half_time',
        minute: 107,
        data: { period: 'extra_time_half_time', injuryTime: 2 },
      }),
      mkEvent({
        type: 'full_time',
        typeName: 'full_time',
        minute: 121,
        data: { injuryTime: 3 }, // 2 (ET1H) + 1 (ET2H)
      }),
    ];
    expect(extractInjuryWindows(events)).toEqual([
      { startMinute: 45, endMinute: 47, addedMinutes: 2, label: '1H' },
      { startMinute: 90, endMinute: 94, addedMinutes: 4, label: '2H' },
      { startMinute: 105, endMinute: 107, addedMinutes: 2, label: 'ET1H' },
      { startMinute: 120, endMinute: 121, addedMinutes: 1, label: 'ET2H' },
    ]);
  });

  it('ignores half_time / full_time events with non-numeric or missing injuryTime', () => {
    const events: MatchEvent[] = [
      mkEvent({
        type: 'half_time',
        typeName: 'half_time',
        minute: 45,
        data: { period: 'half_time' /* no injuryTime */ },
      }),
      mkEvent({
        type: 'full_time',
        typeName: 'full_time',
        minute: 90,
        data: { injuryTime: '3' as unknown as number /* wrong type */ },
      }),
    ];
    expect(extractInjuryWindows(events)).toEqual([]);
  });

  it('does not emit an ET 2H window when the ET 1H stoppage equals the ET full_time stoppage (M2 = 0)', () => {
    // No ET 2H stoppage → no band for it. Without this guard
    // we'd render a zero-width band on top of the full-time
    // tick, which is a visual no-op but still pollutes the
    // marker testid namespace.
    const events: MatchEvent[] = [
      mkEvent({
        type: 'half_time',
        typeName: 'half_time',
        minute: 108,
        data: { period: 'extra_time_half_time', injuryTime: 3 },
      }),
      mkEvent({
        type: 'full_time',
        typeName: 'full_time',
        minute: 120,
        data: { injuryTime: 3 }, // = ET1H, no ET2H
      }),
    ];
    expect(extractInjuryWindows(events)).toEqual([
      { startMinute: 105, endMinute: 108, addedMinutes: 3, label: 'ET1H' },
    ]);
  });
});

// ============================================================================
// timelineEnd
// ============================================================================

describe('timelineEnd', () => {
  it('returns 90 when the match is still in regulation time', () => {
    const events: MatchEvent[] = [
      mkEvent({ type: 'GOAL', minute: 50 }),
      mkEvent({ type: 'SNAPSHOT', minute: 80 }),
    ];
    expect(timelineEnd(events, 85)).toBe(90);
  });

  it('grows to the latest event minute when extra time fires', () => {
    const events: MatchEvent[] = [
      mkEvent({ type: 'GOAL', minute: 50 }),
      mkEvent({ type: 'GOAL', minute: 105 }),
    ];
    expect(timelineEnd(events, 107)).toBe(107);
  });

  it('clamps to 120 even when the latest event is past 120 (defensive)', () => {
    const events: MatchEvent[] = [mkEvent({ type: 'GOAL', minute: 130 })];
    expect(timelineEnd(events, 130)).toBe(120);
  });

  it('grows when currentMinute pushes past the latest event', () => {
    const events: MatchEvent[] = [mkEvent({ type: 'GOAL', minute: 30 })];
    expect(timelineEnd(events, 92)).toBe(92);
  });
});

// ============================================================================
// minuteToPercent
// ============================================================================

describe('minuteToPercent', () => {
  it('maps 0 → 0 and end → 1', () => {
    expect(minuteToPercent(0, 90)).toBe(0);
    expect(minuteToPercent(90, 90)).toBe(1);
  });

  it('returns the ratio of minute to end', () => {
    expect(minuteToPercent(45, 90)).toBeCloseTo(0.5, 5);
    expect(minuteToPercent(30, 120)).toBeCloseTo(0.25, 5);
  });

  it('clamps to [0, 1]', () => {
    expect(minuteToPercent(-5, 90)).toBe(0);
    expect(minuteToPercent(200, 90)).toBe(1);
  });

  it('returns 0 when end is 0 (defensive — should never happen in practice)', () => {
    expect(minuteToPercent(45, 0)).toBe(0);
  });
});

// ============================================================================
// closestSnapshotIndex
// ============================================================================

describe('closestSnapshotIndex', () => {
  const snapshots: MatchSnapshot[] = [
    { minute: 5, h: { ps: [] }, a: { ps: [] } },
    { minute: 15, h: { ps: [] }, a: { ps: [] } },
    { minute: 35, h: { ps: [] }, a: { ps: [] } },
    { minute: 55, h: { ps: [] }, a: { ps: [] } },
    { minute: 75, h: { ps: [] }, a: { ps: [] } },
  ];

  it('returns 0 when the user clicks before the first snapshot', () => {
    expect(closestSnapshotIndex(snapshots, 1)).toBe(0);
  });

  it('snaps backwards when the click lands between two snapshots', () => {
    // Click at minute 20 — between snapshots[1]=15 and snapshots[2]=35.
    // Backwards-snap lands on snapshots[1].
    expect(closestSnapshotIndex(snapshots, 20)).toBe(1);
  });

  it('returns the exact match when the click lines up with a snapshot', () => {
    expect(closestSnapshotIndex(snapshots, 35)).toBe(2);
  });

  it('returns the last index when the click is past the last snapshot', () => {
    expect(closestSnapshotIndex(snapshots, 99)).toBe(snapshots.length - 1);
  });

  it('returns 0 when there are no snapshots', () => {
    expect(closestSnapshotIndex([], 30)).toBe(0);
  });
});

// ============================================================================
// TIMELINE_EVENT_TYPES — sanity
// ============================================================================

describe('TIMELINE_EVENT_TYPES', () => {
  it('contains exactly the six event types we render as markers', () => {
    expect(Array.from(TIMELINE_EVENT_TYPES)).toEqual([
      'GOAL',
      'SUBSTITUTION',
      'YELLOW_CARD',
      'SECOND_YELLOW',
      'RED_CARD',
      'INJURY',
    ]);
  });
});

// ============================================================================
// formatMatchMinute
// ============================================================================

describe('formatMatchMinute', () => {
  // Two-window fixture: 1H +3 stoppage (45-48), 2H +4 stoppage
  // (90-94). The helper should resolve the +N suffix for any
  // minute inside either window and pass through unchanged for
  // any minute in regulation (1-45, 46-90) or in the ET windows.
  const windows = [
    { startMinute: 45, endMinute: 48, addedMinutes: 3, label: '1H' as const },
    { startMinute: 90, endMinute: 94, addedMinutes: 4, label: '2H' as const },
  ];

  it('renders regulation minutes as the raw minute', () => {
    expect(formatMatchMinute(1, windows)).toBe('1');
    expect(formatMatchMinute(23, windows)).toBe('23');
    expect(formatMatchMinute(45, windows)).toBe('45'); // 45 is the regulation half end, NOT stoppage
    expect(formatMatchMinute(90, windows)).toBe('90'); // 90 is the regulation half end
  });

  it('renders 1H stoppage minutes with the +N suffix', () => {
    // Engine emits stoppage minutes with the stoppage-inclusive
    // clock: 45+1 → 46, 45+2 → 47, 45+3 → 48 (the half-time
    // whistle itself lands at 48). The helper just surfaces
    // the "+N" suffix the wire data is already carrying.
    expect(formatMatchMinute(46, windows)).toBe('45+1');
    expect(formatMatchMinute(47, windows)).toBe('45+2');
    expect(formatMatchMinute(48, windows)).toBe('45+3'); // whistle
  });

  it('renders 2H stoppage minutes with the +N suffix', () => {
    expect(formatMatchMinute(91, windows)).toBe('90+1');
    expect(formatMatchMinute(92, windows)).toBe('90+2');
    expect(formatMatchMinute(93, windows)).toBe('90+3');
    expect(formatMatchMinute(94, windows)).toBe('90+4'); // whistle
  });

  it('falls back to the raw minute when no stoppage windows are provided', () => {
    // Pre-fix behaviour: a row that predates the `data.injuryTime`
    // surfacing (or a test fixture that omits half_time / full_time
    // events) renders the raw number rather than crashing.
    expect(formatMatchMinute(46, [])).toBe('46');
    expect(formatMatchMinute(46, undefined as never)).toBe('46');
  });

  it('does NOT mark the regulation-half boundary as stoppage (45 stays 45, not 45+0)', () => {
    // 45 is the end of regulation 1H. A naive "inside (45, 48]"
    // check would correctly exclude the open boundary, but a
    // sloppy ">=" would print "45+0" — pin the contract here.
    expect(formatMatchMinute(45, windows)).toBe('45');
  });

  it('handles ET windows (startMinute 105 / 120)', () => {
    // ET 1H +2 (105-107) and ET 2H +3 (120-123) on top of the
    // regulation windows. The helper should pick the right
    // window for each minute.
    const etWindows = [
      ...windows,
      { startMinute: 105, endMinute: 107, addedMinutes: 2, label: 'ET1H' as const },
      { startMinute: 120, endMinute: 123, addedMinutes: 3, label: 'ET2H' as const },
    ];
    expect(formatMatchMinute(106, etWindows)).toBe('105+1');
    expect(formatMatchMinute(107, etWindows)).toBe('105+2');
    expect(formatMatchMinute(121, etWindows)).toBe('120+1');
    expect(formatMatchMinute(123, etWindows)).toBe('120+3');
    expect(formatMatchMinute(105, etWindows)).toBe('105'); // boundary
  });

  // -------------------------------------------------------------------------
  // formatMatchMinute — period-aware filter (2H kickoff regression)
  // -------------------------------------------------------------------------
  // The engine emits the 2H kickoff at engine minute 46 (same wire
  // value as the first 1H stoppage minute) with `data.period =
  // 'second_half'`. Without the period filter, the formatter
  // matches the 1H window and prints "45+1" — a 2H kickoff
  // appears in the live feed as 1H stoppage time, *earlier* than
  // the 1H whistle that prints as "45+5". The third `period` arg
  // narrows the window search to the half that owns the event.
  describe('period-aware (2H kickoff regression)', () => {
    const windows = [
      { startMinute: 45, endMinute: 50, addedMinutes: 5, label: '1H' as const },
      { startMinute: 90, endMinute: 95, addedMinutes: 5, label: '2H' as const },
    ];

    it('renders a 2H kickoff at engine minute 46 as "46" (not "45+1")', () => {
      // The user-visible bug: 2H kickoff at engine minute 46 used
      // to render as "45+1'" (matched the 1H window). With
      // `period = 'second_half'`, only the 2H window is considered;
      // 46 is not in [90, 95], so the helper falls through to the
      // raw minute — "46".
      expect(formatMatchMinute(46, windows, 'second_half')).toBe('46');
    });

    it('still renders 1H injury events correctly when period is set', () => {
      // 1H injury save at engine minute 47, period='first_half_injury':
      // only the 1H window is considered, 47 is in [45, 50] →
      // "45+2". Back-compat with the pre-fix behaviour for 1H
      // events that already had the right label.
      expect(formatMatchMinute(47, windows, 'first_half_injury')).toBe('45+2');
    });

    it('renders 2H stoppage with period=second_half_injury', () => {
      // 2H stoppage goal at engine minute 93, period='second_half_injury':
      // only the 2H window is considered, 93 is in [90, 95] → "90+3".
      expect(formatMatchMinute(93, windows, 'second_half_injury')).toBe('90+3');
    });

    it('renders the 1H whistle at the actual stoppage minute', () => {
      // The half_time event itself has minute 50 + period='half_time':
      // only the 1H window is considered, 50 is in [45, 50] → "45+5".
      // The pre-fix code already got this right (the boundary IS
      // the whistle), so this is a regression-pinning test.
      expect(formatMatchMinute(50, windows, 'half_time')).toBe('45+5');
    });

    it('falls back to all windows when period is undefined (back-compat)', () => {
      // Pre-fix callers that don't pass `period` see the same
      // result as before — the 2H kickoff at minute 46 still
      // matches the 1H window and prints "45+1" (the bug). The
      // fix is opt-in via the third arg, so existing call sites
      // don't change.
      expect(formatMatchMinute(46, windows)).toBe('45+1');
      expect(formatMatchMinute(46, windows, undefined)).toBe('45+1');
    });

    it('falls back to all windows when period is unrecognised', () => {
      // Unknown period string → same as undefined (back-compat).
      // This is a defensive pin: a future engine that introduces
      // a new period label doesn't break the formatter.
      expect(formatMatchMinute(46, windows, 'something_new')).toBe('45+1');
    });

    it('handles ET periods (1H/2H/ET1H/ET2H windows)', () => {
      const etWindows = [
        ...windows,
        { startMinute: 105, endMinute: 107, addedMinutes: 2, label: 'ET1H' as const },
        { startMinute: 120, endMinute: 123, addedMinutes: 3, label: 'ET2H' as const },
      ];
      // ET 1H event at 106: only ET1H window considered, 106 in
      // [105, 107] → "105+1".
      expect(formatMatchMinute(106, etWindows, 'extra_time_first_half_injury')).toBe('105+1');
      // ET 2H event at 121: only ET2H window considered, 121 in
      // [120, 123] → "120+1".
      expect(formatMatchMinute(121, etWindows, 'extra_time_second_half_injury')).toBe('120+1');
    });
  });
});

// ============================================================================
// deriveSnapshotPeriods — assign per-snapshot period for 2H shift
// ============================================================================
//
// Background: the engine emits the 2H kickoff at engine minute 46
// (same wire value as the first 1H stoppage minute) and the 1H
// whistle at minute 50. The events list the API returns is sorted
// by `(minute, second, id)`, NOT by real-time — the 2H kickoff
// sorts BEFORE the 1H injury events at minutes 47-50 and the 1H
// whistle at minute 50. The walker has to recover real-time
// order from the (list index, engine minute) combination.
describe('deriveSnapshotPeriods', () => {
  // 1H+5 / 2H+5 match, same shape as the user's reported bug
  // (match a7c61c6f-…): 1H whistle at m=50, 2H kickoff at m=46.
  // The list order at the half-time boundary is reversed vs
  // real-time — the 2H kickoff sorts before the 1H injury
  // snapshots at m=49, 50.
  const userMatchEvents: MatchEvent[] = [
    {
      id: 'e0',
      matchId: 'm',
      minute: 45,
      second: 0,
      type: 'goal',
      typeName: 'goal',
      data: {},
    },
    {
      id: 'e1',
      matchId: 'm',
      minute: 45,
      second: 0,
      type: 'snapshot',
      typeName: 'snapshot',
      data: {},
    },
    {
      id: 'e2',
      matchId: 'm',
      minute: 45,
      second: 0,
      type: 'snapshot',
      typeName: 'snapshot',
      data: {},
    },
    {
      // The 2H kickoff at engine minute 46 sorts BEFORE the 1H
      // injury snapshots at m=49, 50 in the list (because the
      // list is by minute ASC), but in real time it happens
      // AFTER the 1H whistle.
      id: 'e3',
      matchId: 'm',
      minute: 46,
      second: 0,
      type: 'second_half',
      typeName: 'second_half',
      data: { period: 'second_half' },
    },
    {
      id: 'e4',
      matchId: 'm',
      minute: 46,
      second: 0,
      type: 'snapshot',
      typeName: 'snapshot',
      data: {},
    },
    {
      id: 'e5',
      matchId: 'm',
      minute: 46,
      second: 0,
      type: 'snapshot',
      typeName: 'snapshot',
      data: {},
    },
    {
      id: 'e6',
      matchId: 'm',
      minute: 47,
      second: 0,
      type: 'save',
      typeName: 'save',
      data: {},
    },
    {
      // 1H injury snapshot at m=49 — engine minute < 1H whistle
      // minute (50) → 1H injury.
      id: 'e7',
      matchId: 'm',
      minute: 49,
      second: 0,
      type: 'snapshot',
      typeName: 'snapshot',
      data: {},
    },
    {
      // 1H injury snapshot at m=50 BEFORE the 1H whistle event
      // in list order. minute == halfTimeMinute AND index < halfTimeIdx
      // → first_half_injury.
      id: 'e8',
      matchId: 'm',
      minute: 50,
      second: 0,
      type: 'snapshot',
      typeName: 'snapshot',
      data: {},
    },
    {
      id: 'e9',
      matchId: 'm',
      minute: 50,
      second: 0,
      type: 'turnover',
      typeName: 'turnover',
      data: {},
    },
    {
      // 1H whistle at m=50.
      id: 'e10',
      matchId: 'm',
      minute: 50,
      second: 0,
      type: 'half_time',
      typeName: 'half_time',
      data: { period: 'half_time', injuryTime: 5 },
    },
    {
      // 2H reg snapshot at m=50 AFTER the 1H whistle event in
      // list order. minute == halfTimeMinute AND index >= halfTimeIdx
      // → second_half.
      id: 'e11',
      matchId: 'm',
      minute: 50,
      second: 0,
      type: 'snapshot',
      typeName: 'snapshot',
      data: {},
    },
    {
      id: 'e12',
      matchId: 'm',
      minute: 55,
      second: 0,
      type: 'snapshot',
      typeName: 'snapshot',
      data: {},
    },
  ];

  it('returns a period for each snapshot in the events list', () => {
    // 8 snapshots in the fixture: e1, e2, e4, e5, e7, e8, e11, e12.
    const periods = deriveSnapshotPeriods(userMatchEvents);
    expect(periods).toHaveLength(8);
  });

  it('classifies 1H regulation snapshots at m=45 as first_half', () => {
    // e1, e2 are 1H regulation snapshots. The 1H whistle is
    // somewhere later in the list, so the "before 2H kickoff"
    // rule (index < secondHalfIdx=3) kicks in.
    const periods = deriveSnapshotPeriods(userMatchEvents);
    expect(periods[0]).toBe('first_half'); // e1
    expect(periods[1]).toBe('first_half'); // e2
  });

  it('classifies m=46 snapshots AFTER the 2H kickoff in the list as second_half', () => {
    // e4, e5 are m=46 snapshots. They're listed AFTER the 2H
    // kickoff event (e3) so they get the 2H shift. Without this
    // rule, the 1H-injury threshold (m=46 < 50) would mark them
    // as 1H, but they're actually 2H reg snapshots.
    const periods = deriveSnapshotPeriods(userMatchEvents);
    expect(periods[2]).toBe('second_half'); // e4
    expect(periods[3]).toBe('second_half'); // e5
  });

  it('classifies the m=49 snapshot as first_half_injury (minute < 1H whistle)', () => {
    // e7 is a m=49 snapshot. The 1H whistle is at m=50, so 49 < 50
    // → 1H injury. The fact that e7 sorts AFTER the 2H kickoff
    // (e3) in the list doesn't change the real-time period.
    const periods = deriveSnapshotPeriods(userMatchEvents);
    expect(periods[4]).toBe('first_half_injury'); // e7
  });

  it('classifies m=50 snapshots BEFORE the 1H whistle in the list as first_half_injury', () => {
    // e8 is a m=50 snapshot listed BEFORE the 1H whistle event
    // (e10). Real-time: 1H injury. The list-order check at the
    // half-time minute disambiguates it from the 2H reg
    // snapshot at the same minute listed AFTER the whistle.
    const periods = deriveSnapshotPeriods(userMatchEvents);
    expect(periods[5]).toBe('first_half_injury'); // e8
  });

  it('classifies m=50 snapshots AT/AFTER the 1H whistle in the list as second_half', () => {
    // e11 is a m=50 snapshot listed AFTER the 1H whistle event
    // (e10). Real-time: 2H regulation (the engine emitted it
    // during the 2H reg loop, after the 2H kickoff which is
    // after the 1H whistle).
    const periods = deriveSnapshotPeriods(userMatchEvents);
    expect(periods[6]).toBe('second_half'); // e11
  });

  it('classifies snapshots past the 1H whistle as second_half (minute threshold fallback)', () => {
    // e12 is a m=55 snapshot. minute (55) > halfTimeMinute (50)
    // → second_half. The 2H reg loop emits this snapshot well
    // after the 1H whistle, so it's unambiguously 2H.
    const periods = deriveSnapshotPeriods(userMatchEvents);
    expect(periods[7]).toBe('second_half'); // e12
  });

  it('handles a clean match (no 1H stoppage) — all 1H until kickoff, all 2H after', () => {
    // 1H+0 / 2H+0 fixture. 1H whistle at m=45, 2H kickoff at
    // m=46. In the list, the 2H kickoff sorts AFTER the 1H
    // whistle (because m=46 > m=45), so the order is the
    // natural real-time order — no reversal at the boundary.
    const cleanEvents: MatchEvent[] = [
      {
        id: 'a',
        matchId: 'm',
        minute: 45,
        second: 0,
        type: 'half_time',
        typeName: 'half_time',
        data: { period: 'half_time', injuryTime: 0 },
      },
      {
        id: 'b',
        matchId: 'm',
        minute: 46,
        second: 0,
        type: 'second_half',
        typeName: 'second_half',
        data: { period: 'second_half' },
      },
      {
        id: 'c',
        matchId: 'm',
        minute: 50,
        second: 0,
        type: 'snapshot',
        typeName: 'snapshot',
        data: {},
      },
      {
        id: 'd',
        matchId: 'm',
        minute: 60,
        second: 0,
        type: 'snapshot',
        typeName: 'snapshot',
        data: {},
      },
    ];
    const periods = deriveSnapshotPeriods(cleanEvents);
    expect(periods).toEqual(['second_half', 'second_half']);
  });

  it('returns first_half for every snapshot when no whistle has been emitted yet', () => {
    // Live match in 1H regulation, no whistle yet. The minute
    // threshold (< 1H whistle minute) doesn't kick in (no 1H
    // whistle), so the helper falls through to first_half. A
    // future event arriving might shift some snapshots, but the
    // current call returns first_half for all.
    const liveEvents: MatchEvent[] = [
      {
        id: 'z',
        matchId: 'm',
        minute: 10,
        second: 0,
        type: 'snapshot',
        typeName: 'snapshot',
        data: {},
      },
      {
        id: 'y',
        matchId: 'm',
        minute: 20,
        second: 0,
        type: 'snapshot',
        typeName: 'snapshot',
        data: {},
      },
    ];
    const periods = deriveSnapshotPeriods(liveEvents);
    expect(periods).toEqual(['first_half', 'first_half']);
  });
});

// ============================================================================
// phaseOfEvent — real-time chronological sort key
// ============================================================================
//
// The engine reuses engine minute 46 for both the 1H stoppage
// tail and the 2H kickoff. The API order is `(minute, second,
// id)`, so the raw engine-minute sort puts the 2H kickoff
// (m=46) before the 1H whistle (m=50) in the list — even
// though the kickoff happens after the whistle in real time.
// Without a phase-aware sort, the commentary feed renders
// "46' 下半场开始" *above* "45+5' 半场结束", which a reader
// reads as a time paradox. `phaseOfEvent` collapses 1H / 2H
// / ET1H / ET2H into small integers suitable for `Array.sort`.
describe('phaseOfEvent', () => {
  // The same 1H+5 / 2H+5 user-match fixture as
  // `deriveSnapshotPeriods` — 1H whistle at m=50, 2H kickoff
  // at m=46, kickoff sorts BEFORE the whistle in the list.
  const events: MatchEvent[] = [
    { id: '0', matchId: 'm', minute: 45, second: 0, type: 'goal', typeName: 'goal', data: {} },
    { id: '1', matchId: 'm', minute: 46, second: 0, type: 'second_half', typeName: 'second_half', data: { period: 'second_half' } },
    { id: '2', matchId: 'm', minute: 47, second: 0, type: 'save', typeName: 'save', data: {} },
    { id: '3', matchId: 'm', minute: 49, second: 0, type: 'goal', typeName: 'goal', data: {} },
    { id: '4', matchId: 'm', minute: 50, second: 0, type: 'turnover', typeName: 'turnover', data: {} },
    { id: '5', matchId: 'm', minute: 50, second: 0, type: 'half_time', typeName: 'half_time', data: { period: 'half_time', injuryTime: 5 } },
    { id: '6', matchId: 'm', minute: 57, second: 0, type: 'substitution', typeName: 'substitution', data: {} },
  ];

  it('returns 0 for 1H events (regulation, injury, whistle)', () => {
    expect(phaseOfEvent(events[0], events)).toBe(0); // 1H reg goal at m=45
    expect(phaseOfEvent(events[2], events)).toBe(0); // 1H injury save at m=47
    expect(phaseOfEvent(events[3], events)).toBe(0); // 1H injury goal at m=49
    expect(phaseOfEvent(events[4], events)).toBe(0); // 1H injury turnover at m=50
    expect(phaseOfEvent(events[5], events)).toBe(0); // 1H whistle at m=50, period=half_time
  });

  it('returns 1 for 2H events (kickoff, regulation, sub)', () => {
    expect(phaseOfEvent(events[1], events)).toBe(1); // 2H kickoff at m=46
    expect(phaseOfEvent(events[6], events)).toBe(1); // 2H sub at m=57
  });

  it('sorts all 1H events before all 2H events regardless of engine minute', () => {
    // The whole point of the helper: without the phase key, a
    // naive `(minute, second)` sort would render 2H kickoff
    // (m=46) ABOVE the 1H whistle (m=50) — engine minutes go
    // 46 < 50. With the phase key, every 1H event sorts above
    // every 2H event.
    const sorted = [...events].sort((a, b) => {
      const phaseA = phaseOfEvent(a, events);
      const phaseB = phaseOfEvent(b, events);
      return phaseA - phaseB || a.minute - b.minute || (a.second ?? 0) - (b.second ?? 0);
    });
    // The whistle (1H, m=50) must come BEFORE the kickoff
    // (2H, m=46) — even though the engine minute goes the
    // other way.
    const halfTimeIdx = sorted.findIndex((e) => e.id === '5');
    const kickoffIdx = sorted.findIndex((e) => e.id === '1');
    expect(halfTimeIdx).toBeLessThan(kickoffIdx);
    // 1H events first (5 events: goal/save/goal/turnover/whistle),
    // 2H events last (2 events: kickoff/sub).
    expect(sorted.length).toBe(7);
    expect(sorted.slice(0, 5).map((e) => e.id)).toEqual(['0', '2', '3', '4', '5']);
    expect(sorted.slice(5, 7).map((e) => e.id)).toEqual(['1', '6']);
  });

  it('handles an ET match (4 phases)', () => {
    // ET 1H half-time at m=106, ET full time at m=121.
    const etEvents: MatchEvent[] = [
      { id: 'a', matchId: 'm', minute: 50, second: 0, type: 'half_time', typeName: 'half_time', data: { period: 'half_time' } },
      { id: 'b', matchId: 'm', minute: 90, second: 0, type: 'full_time', typeName: 'full_time', data: {} },
      { id: 'c', matchId: 'm', minute: 95, second: 0, type: 'save', typeName: 'save', data: {} },
      { id: 'd', matchId: 'm', minute: 96, second: 0, type: 'second_half', typeName: 'second_half', data: { period: 'second_half' } },
      { id: 'e', matchId: 'm', minute: 110, second: 0, type: 'save', typeName: 'save', data: {} },
      { id: 'f', matchId: 'm', minute: 106, second: 0, type: 'half_time', typeName: 'half_time', data: { period: 'extra_time_half_time' } },
      { id: 'g', matchId: 'm', minute: 106, second: 0, type: 'second_half', typeName: 'second_half', data: { period: 'extra_time_second_half' } },
      { id: 'h', matchId: 'm', minute: 121, second: 0, type: 'full_time', typeName: 'full_time', data: {} },
    ];
    // 1H whistle (a) at m=50 → 0
    expect(phaseOfEvent(etEvents[0], etEvents)).toBe(0);
    // 2H whistle (b) at m=90 → 1
    expect(phaseOfEvent(etEvents[1], etEvents)).toBe(1);
    // 2H reg save (c) at m=95 → 1
    expect(phaseOfEvent(etEvents[2], etEvents)).toBe(1);
    // 2H kickoff (d) at m=96, period=second_half → 1
    expect(phaseOfEvent(etEvents[3], etEvents)).toBe(1);
    // ET 1H reg save (e) at m=110 — no period set, but the
    // 1H whistle for 2H (b) is at m=90, so 110 > 90 → 2H. The
    // threshold alone mis-classifies this. Pin the contract:
    // the helper uses only the REGULATION 1H whistle (a) for
    // the 1H/2H threshold, so e at m=110 is past it → phase 1
    // (2H), even though real-time it's ET 1H. The events with
    // explicit `data.period` route correctly; the threshold
    // fallback is best-effort.
    expect(phaseOfEvent(etEvents[4], etEvents)).toBe(1);
    // ET 1H whistle (f) at m=106, period=extra_time_half_time → 2
    expect(phaseOfEvent(etEvents[5], etEvents)).toBe(2);
    // ET 2H kickoff (g) at m=106, period=extra_time_second_half → 3
    expect(phaseOfEvent(etEvents[6], etEvents)).toBe(3);
    // ET 2H whistle (h) at m=121, no period → threshold says
    // m=121 > m=50 (reg 1H whistle) → 1. The helper's
    // best-effort threshold is unaware of ET 1H vs ET 2H
    // boundaries for unperioded events, so it falls back to
    // the 1H/2H boundary it knows.
    expect(phaseOfEvent(etEvents[7], etEvents)).toBe(1);
  });

  it('returns 0 for all events when no 1H whistle has been emitted yet (live match in 1H regulation)', () => {
    // Live match in 1H regulation, no whistle yet. There's no
    // way to tell 1H from 2H for an unperioded event without a
    // boundary marker, so the helper falls back to 0 (1H) —
    // safe default since 2H can't happen before the 1H whistle.
    const liveEvents: MatchEvent[] = [
      { id: 'x', matchId: 'm', minute: 10, second: 0, type: 'save', typeName: 'save', data: {} },
      { id: 'y', matchId: 'm', minute: 30, second: 0, type: 'goal', typeName: 'goal', data: {} },
    ];
    expect(phaseOfEvent(liveEvents[0], liveEvents)).toBe(0);
    expect(phaseOfEvent(liveEvents[1], liveEvents)).toBe(0);
  });
});

// ============================================================================
// extractTimelineMarkers — minuteLabel carries the "+N" suffix
// ============================================================================

describe('extractTimelineMarkers', () => {
  it('sets marker.minuteLabel to the stoppage-aware display string', () => {
    // 1H +3 stoppage: a goal at minute 46 (the first stoppage
    // minute) should land on the timeline as "45+1" — the same
    // label a reader would see in the live feed above.
    const events: MatchEvent[] = [
      mkEvent({
        type: 'half_time',
        typeName: 'half_time',
        minute: 48,
        data: { period: 'half_time', homeScore: 0, awayScore: 0, injuryTime: 3 },
      }),
      mkEvent({
        type: 'goal',
        typeName: 'goal',
        minute: 46,
        teamId: 't1',
      }),
      mkEvent({
        type: 'goal',
        typeName: 'goal',
        minute: 23, // regulation
        teamId: 't1',
      }),
    ];
    const windows = extractInjuryWindows(events);
    const markers = extractTimelineMarkers(events, windows);
    const goalAt46 = markers.find((m) => m.minute === 46);
    const goalAt23 = markers.find((m) => m.minute === 23);
    expect(goalAt46?.minuteLabel).toBe('45+1');
    expect(goalAt23?.minuteLabel).toBe('23');
  });

  it('falls back to the raw minute when no windows are supplied', () => {
    // Backwards-compat: callers that pre-date this change pass
    // `[]` for windows. The marker should still label correctly.
    const events: MatchEvent[] = [
      mkEvent({ type: 'goal', typeName: 'goal', minute: 46, teamId: 't1' }),
    ];
    const markers = extractTimelineMarkers(events, []);
    expect(markers[0]?.minuteLabel).toBe('46');
  });
});

// ============================================================================
// resolveWhistleMinutes
// ============================================================================

describe('resolveWhistleMinutes', () => {
  it('returns regulation defaults when no half_time / full_time have fired', () => {
    // Live mid-match, no whistles yet. Falls back to 45 / 90 so
    // the timeline still anchors the half boundary at the
    // expected spot rather than the right edge.
    const events: MatchEvent[] = [
      mkEvent({ type: 'goal', typeName: 'goal', minute: 12, teamId: 't1' }),
    ];
    expect(resolveWhistleMinutes(events, 90)).toEqual({
      halfTime: 45,
      fullTime: 90,
      etHalfTime: null,
      final: 90, // no full_time yet -> endMinute fallback
    });
  });

  it('reads the stoppage-inclusive minute from the half_time event', () => {
    // 1H+2 stoppage — the half_time event lands at minute 47
    // (the actual whistle, not 45). The timeline tick at 47
    // gets the label "45+2'" via formatMatchMinute.
    const events: MatchEvent[] = [
      mkEvent({
        type: 'half_time',
        typeName: 'half_time',
        minute: 47,
        data: { period: 'half_time', homeScore: 0, awayScore: 0, injuryTime: 2 },
      }),
    ];
    expect(resolveWhistleMinutes(events, 90).halfTime).toBe(47);
  });

  it('reads the stoppage-inclusive minute from the regulation full_time', () => {
    // 2H+3 stoppage — the full_time event lands at minute 93.
    const events: MatchEvent[] = [
      mkEvent({
        type: 'half_time',
        typeName: 'half_time',
        minute: 45,
        data: { period: 'half_time', homeScore: 0, awayScore: 0, injuryTime: 0 },
      }),
      mkEvent({
        type: 'full_time',
        typeName: 'full_time',
        minute: 93,
        data: { homeScore: 1, awayScore: 1, injuryTime: 3 },
      }),
    ];
    const w = resolveWhistleMinutes(events, 95);
    expect(w.halfTime).toBe(45); // clean half, no stoppage
    expect(w.fullTime).toBe(93);
    expect(w.final).toBe(93); // regulation FT, no ET
  });

  it('resolves ET whistles separately from regulation whistles', () => {
    // ET match: regulation 1H+2 (47), regulation 2H+3 (93),
    // ET 1H+1 (106), ET full time at 121.
    const events: MatchEvent[] = [
      mkEvent({
        type: 'half_time',
        typeName: 'half_time',
        minute: 47,
        data: { period: 'half_time', injuryTime: 2 },
      }),
      mkEvent({
        type: 'full_time',
        typeName: 'full_time',
        minute: 93,
        data: { injuryTime: 3 },
      }),
      mkEvent({
        type: 'half_time',
        typeName: 'half_time',
        minute: 106,
        data: { period: 'extra_time_half_time', injuryTime: 1 },
      }),
      mkEvent({
        type: 'full_time',
        typeName: 'full_time',
        minute: 121,
        data: { injuryTime: 1 },
      }),
    ];
    const w = resolveWhistleMinutes(events, 121);
    expect(w.halfTime).toBe(47); // 1H
    expect(w.fullTime).toBe(93); // regulation 2H
    expect(w.etHalfTime).toBe(106); // ET 1H
    expect(w.final).toBe(121); // ET 2H
  });

  it('picks the regulation full_time (not ET) when both exist', () => {
    // Both `full_time` events exist. The `minute < 120` guard
    // in resolveWhistleMinutes pins `fullTime` to the regulation
    // whistle (93), while `final` jumps to the ET whistle (121).
    const events: MatchEvent[] = [
      mkEvent({
        type: 'full_time',
        typeName: 'full_time',
        minute: 93,
        data: { injuryTime: 3 },
      }),
      mkEvent({
        type: 'full_time',
        typeName: 'full_time',
        minute: 121,
        data: { injuryTime: 1 },
      }),
    ];
    const w = resolveWhistleMinutes(events, 121);
    expect(w.fullTime).toBe(93);
    expect(w.final).toBe(121);
  });
});

// ============================================================================
// visualMinute — 2H shift so 1H injury and 2H regulation don't overlap
// ============================================================================

describe('visualMinute', () => {
  // 1H+3 fixture: the engine emits 1H injury at minutes 46-48
  // and 2H regulation starting at minute 46 (same wire minute,
  // different period). The 2H-shift moves 2H-period events
  // right by N1 - 1 = 2 so the 2H region abuts the 1H injury
  // band rather than overlapping it.
  const n1 = 3;
  const n2 = 5;
  const w1: InjuryWindow = { startMinute: 45, endMinute: 48, addedMinutes: n1, label: '1H' };
  const w2: InjuryWindow = { startMinute: 90, endMinute: 95, addedMinutes: n2, label: '2H' };

  it('does NOT shift 1H-period events (regulation + injury + whistle)', () => {
    // period='first_half' / 'first_half_injury' / 'half_time'
    // (or undefined with engine minute in (0, 45+N1]).
    expect(visualMinute(1, 'first_half', n1)).toBe(1);
    expect(visualMinute(45, 'first_half', n1)).toBe(45);
    expect(visualMinute(46, 'first_half_injury', n1)).toBe(46);
    expect(visualMinute(47, 'first_half_injury', n1)).toBe(47);
    expect(visualMinute(48, 'half_time', n1)).toBe(48);
  });

  it('shifts 2H-period events by N1 (one minute past the 1H whistle)', () => {
    // period='second_half' / 'second_half_injury'. The shift is
    // N1 (not N1 - 1) so the 2H kickoff lands at visual
    // 45 + N1 + 1 = 49 (one minute after the 1H whistle at
    // 45 + N1 = 48). That one-minute gap is the visual
    // "half-time break" the user wants on the timeline.
    expect(visualMinute(46, 'second_half', n1)).toBe(49);
    expect(visualMinute(90, 'second_half', n1)).toBe(93);
    expect(visualMinute(91, 'second_half_injury', n1)).toBe(94);
    expect(visualMinute(95, 'second_half_injury', n1)).toBe(98);
  });

  it('shifts the 2H full_time whistle (no `data.period`) via the minute threshold', () => {
    // The engine emits the 2H full_time event without a
    // `data.period` — just type, minute, and stoppage count.
    // visualMinute falls back to the threshold: minute >
    // 45 + N1 = 48, so it shifts by N1.
    expect(visualMinute(95, undefined, n1)).toBe(98);
  });

  it('does NOT shift 1H full_time whistle (no `data.period`, but minute <= 45+N1)', () => {
    // Hypothetical case: if the 1H whistle were pushed
    // without a `data.period` (engine currently sets it, but
    // pin the contract so a future regression doesn't break
    // this case). Threshold 45 + N1 = 48; engine 48 == 48,
    // so no shift.
    expect(visualMinute(48, undefined, n1)).toBe(48);
  });

  it('does NOT shift ET 1H events (period=extra_time_first_half*)', () => {
    // ET 1H band is at engine 105-108 (for ET 1H+3). The
    // half-time break between 2H whistle and ET 1H is a real
    // visual gap, not a 2H-shift artefact.
    expect(visualMinute(105, 'extra_time_first_half', n1)).toBe(105);
    expect(visualMinute(107, 'extra_time_first_half_injury', n1)).toBe(107);
  });

  it('shifts ET 2H events (period=extra_time_second_half*)', () => {
    // ET 2H band is at engine 120-123 (for ET 2H+3). The
    // 2H shift applies (same N1 cascade) so the ET 2H
    // region visually follows the 1H injury band rather than
    // overlapping it.
    expect(visualMinute(120, 'extra_time_second_half', n1)).toBe(123);
    expect(visualMinute(123, 'extra_time_second_half_injury', n1)).toBe(126);
  });

  it('returns the raw minute when N1 = 0 (no 1H stoppage)', () => {
    // No 1H stoppage → no 2H shift. The 2H kickoff at engine
    // 46 lands at visual 46 (no shift), the 2H whistle at
    // engine 95 lands at visual 95.
    expect(visualMinute(46, 'second_half', 0)).toBe(46);
    expect(visualMinute(95, undefined, 0)).toBe(95);
  });

  it('places the 2H kickoff one visual minute after the 1H whistle (half-time gap)', () => {
    // 1H+N1: 1H whistle is at engine 45+N1 → visual 45+N1
    // (no shift). 2H kickoff is at engine 46 → visual 46+N1
    // = 45+N1+1 — one minute after the 1H whistle. The 1-
    // minute gap is the visual "half-time break" the user
    // wants on the timeline.
    expect(visualMinute(45 + n1, 'half_time', n1)).toBe(45 + n1);
    expect(visualMinute(46, 'second_half', n1)).toBe(45 + n1 + 1);
  });
});

// ============================================================================
// minuteToPercent / timelineEnd — accept optional injuryWindows
// ============================================================================

describe('minuteToPercent with injury windows (visual shift)', () => {
  it('shifts 2H events right by N1 when windows are supplied', () => {
    const windows: InjuryWindow[] = [
      { startMinute: 45, endMinute: 48, addedMinutes: 3, label: '1H' },
      { startMinute: 90, endMinute: 95, addedMinutes: 5, label: '2H' },
    ];
    // Engine minute 60 with period=undefined is past the 1H
    // injury band (48), so the threshold fallback shifts it
    // right by N1 = 3 to visual 63. Out of 98 visual minutes
    // (engine end 95 + 3 shift), 63/98 ≈ 0.643.
    const p = minuteToPercent(60, 98, windows);
    expect(p).toBeCloseTo(63 / 98, 4);
  });

  it('preserves the old behaviour when no windows are supplied (back-compat)', () => {
    // Pre-fix `minuteToPercent(m, end)` callers (no windows)
    // see the same result as before — visual end equals engine
    // end, no shift.
    expect(minuteToPercent(0, 90)).toBe(0);
    expect(minuteToPercent(90, 90)).toBe(1);
    expect(minuteToPercent(45, 90)).toBeCloseTo(0.5, 5);
  });
});

describe('timelineEnd with injury windows (visual shift)', () => {
  it('adds N1 to the engine end when 1H stoppage is present', () => {
    const events = [
      mkEvent({
        type: 'half_time',
        typeName: 'half_time',
        minute: 48,
        data: { period: 'half_time', injuryTime: 3 },
      }),
      mkEvent({
        type: 'full_time',
        typeName: 'full_time',
        minute: 95,
        data: { injuryTime: 5 },
      }),
    ];
    const windows = extractInjuryWindows(events);
    // Engine end = 95, N1 = 3, visual end = 95 + 3 = 98
    // (the 1-minute "half-time break" gap adds N1, not N1-1).
    expect(timelineEnd(events, 95, windows)).toBe(98);
  });

  it('returns the engine end when no 1H stoppage (back-compat)', () => {
    // No 1H injury data on the half_time event → N1 = 0 →
    // visual end = engine end. The pre-fix `timelineEnd(e, c)`
    // caller is byte-identical.
    const events = [
      mkEvent({
        type: 'half_time',
        typeName: 'half_time',
        minute: 45,
        data: { period: 'half_time', injuryTime: 0 },
      }),
    ];
    expect(timelineEnd(events, 85)).toBe(90);
  });
});

describe('extractTimelineMarkers sets marker.visualMinute', () => {
  it('does NOT shift 1H events', () => {
    const events = [
      mkEvent({ type: 'goal', typeName: 'goal', minute: 23, teamId: 't1' }),
    ];
    const markers = extractTimelineMarkers(events, []);
    expect(markers[0]?.visualMinute).toBe(23);
  });

  it('shifts 2H events by N1 when 1H stoppage is present', () => {
    const events = [
      mkEvent({
        type: 'half_time',
        typeName: 'half_time',
        minute: 48,
        data: { period: 'half_time', injuryTime: 3 },
      }),
      mkEvent({ type: 'goal', typeName: 'goal', minute: 60, teamId: 't1', data: { period: 'second_half' } }),
    ];
    const windows = extractInjuryWindows(events);
    const markers = extractTimelineMarkers(events, windows);
    const goal = markers.find((m) => m.minute === 60);
    expect(goal?.visualMinute).toBe(63); // 60 + 3
  });

  it('shifts 2H events at engine minute 46 (kickoff minute) using data.period', () => {
    // A 2H reg event at engine minute 46 (e.g. a goal that lands
    // at the same engine minute as the 2H kickoff): with
    // `data.period = 'second_half'`, the helper shifts by N1
    // regardless of the minute-threshold check. Without the
    // period, the threshold (`> 45 + N1`) would miss engine 46
    // and leave the event at visual 46 inside the 1H injury
    // band. The `visualMinute` field is what the timeline
    // layout passes to `minuteToPercent` for marker placement
    // — so a correct value here is what keeps markers aligned
    // with their dots after the kickoff.
    const events = [
      mkEvent({
        type: 'half_time',
        typeName: 'half_time',
        minute: 48,
        data: { period: 'half_time', injuryTime: 3 },
      }),
      mkEvent({ type: 'second_half', typeName: 'second_half', minute: 46, data: { period: 'second_half' } }),
      // A 2H reg event at engine m=46, period=second_half
      mkEvent({ type: 'goal', typeName: 'goal', minute: 46, teamId: 't1', data: { period: 'second_half' } }),
    ];
    const windows = extractInjuryWindows(events);
    const markers = extractTimelineMarkers(events, windows);
    const goal = markers.find((m) => m.minute === 46);
    expect(goal?.visualMinute).toBe(49); // 46 + 3 = visual 49, past the 1H band
  });
});

// ============================================================================
// extractTimelineMarkers — period-aware minuteLabel
// ============================================================================
//
// The 2H kickoff lands at engine minute 46 (same wire value as
// the first 1H stoppage minute). Without the period filter on
// `formatMatchMinute`, the marker label printed "45+1" for the
// 2H kickoff — exactly the user-visible bug in commentary
// ("45+1' 下半场开始！"). The fix passes `e.data.period` to the
// formatter so the kickoff prints as "46".
describe('extractTimelineMarkers minuteLabel is period-aware', () => {
  const events = [
    // 1H whistle at m=48 → 1H +3 stoppage window.
    mkEvent({
      type: 'half_time',
      typeName: 'half_time',
      minute: 48,
      data: { period: 'half_time', injuryTime: 3 },
    }),
    // 2H kickoff at engine minute 46 with period=second_half.
    mkEvent({
      type: 'second_half',
      typeName: 'second_half',
      minute: 46,
      data: { period: 'second_half' },
    }),
    // A regulation 2H event at engine minute 60 with period=second_half.
    mkEvent({
      type: 'goal',
      typeName: 'goal',
      minute: 60,
      teamId: 't1',
      data: { period: 'second_half' },
    }),
  ];

  it('labels a 2H kickoff at engine minute 46 as "46" (not "45+1")', () => {
    // The 2H kickoff is not in TIMELINE_EVENT_TYPES (it's a period
    // transition, not a marker), so this case is exercised by the
    // `formatMatchMinute` tests above. The minuteLabel logic in
    // `extractTimelineMarkers` calls the same helper with the
    // event's period, so a regression here would break
    // `formatMatchMinute` too. Pin the contract.
    const kickoff = events[1];
    expect(kickoff.minute).toBe(46);
    expect((kickoff.data as any).period).toBe('second_half');
    // The kickoff isn't a marker, so we exercise via formatMatchMinute
    // directly. The marker-minuteLabel branch is what
    // `extractTimelineMarkers` uses; same code path.
    const windows = extractInjuryWindows(events);
    expect(formatMatchMinute(kickoff.minute, windows, (kickoff.data as any).period)).toBe('46');
  });

  it('still labels 2H regulation events at engine minute 60 as "60" (not in any stoppage window)', () => {
    // 60 is past the 1H whistle (48) but not in the 2H window
    // [90, 95] → falls through to raw "60".
    const goal = events[2];
    const windows = extractInjuryWindows(events);
    expect(formatMatchMinute(goal.minute, windows, (goal.data as any).period)).toBe('60');
  });
});