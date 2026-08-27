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
  extractInjuryWindows,
  extractTimelineMarkers,
  formatMatchMinute,
  minuteToPercent,
  timelineEnd,
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