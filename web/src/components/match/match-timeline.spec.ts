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
  extractTimelineMarkers,
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

  it('keeps goals / subs / yellow / red cards, ignores other types', () => {
    const events: MatchEvent[] = [
      mkEvent({ type: 'GOAL', minute: 12, isHome: true, teamId: 'home' }),
      mkEvent({ type: 'SUBSTITUTION', minute: 55, isHome: false, teamId: 'away' }),
      mkEvent({ type: 'YELLOW_CARD', minute: 30, isHome: true, teamId: 'home' }),
      mkEvent({ type: 'RED_CARD', minute: 70, isHome: false, teamId: 'away' }),
      mkEvent({ type: 'CORNER', minute: 18 }),
      mkEvent({ type: 'INJURY', minute: 40 }),
      mkEvent({ type: 'SNAPSHOT', minute: 25 }),
    ];
    const markers = extractTimelineMarkers(events);
    expect(markers.map((m) => m.type)).toEqual([
      'GOAL',
      'YELLOW_CARD',
      'SUBSTITUTION',
      'RED_CARD',
    ]);
    expect(markers.map((m) => m.minute)).toEqual([12, 30, 55, 70]);
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
  it('contains exactly the five event types we render as markers', () => {
    expect(Array.from(TIMELINE_EVENT_TYPES)).toEqual([
      'GOAL',
      'SUBSTITUTION',
      'YELLOW_CARD',
      'SECOND_YELLOW',
      'RED_CARD',
    ]);
  });
});