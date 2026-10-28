/**
 * match-completion.spec.ts — pins the markers the report chrome uses to
 * turn "FT" into "AET" / "PENS", plus the scorelines the hero renders
 * (`1 · 1` with a `PENS 4–3` chip instead of the stored spot-kick score).
 *
 * The two failure modes this guards against:
 *  - reading `minute > 90` (2H stoppage also lands at 91'–95', so any late
 *    league goal would have been mislabelled as extra time);
 *  - trusting the *last* event (post-match bookkeeping can append rows after
 *    the closing `full_time`).
 */

import type { MatchEvent } from '@/lib/api';
import { getCompletionInfo, getCompletionMarker } from './match-completion';

function evt(overrides: Partial<MatchEvent>): MatchEvent {
  return {
    id: overrides.id ?? `e-${Math.random()}`,
    matchId: 'm1',
    minute: 0,
    second: 0,
    type: 'kickoff',
    typeName: 'kickoff',
    ...overrides,
  } as MatchEvent;
}

describe('getCompletionMarker', () => {
  it('returns null for a regulation match', () => {
    const events = [
      evt({ minute: 1, type: 'kickoff', typeName: 'kickoff' }),
      evt({ minute: 45, type: 'half_time', typeName: 'half_time' }),
      evt({ minute: 46, type: 'kickoff', typeName: 'kickoff' }),
      evt({ minute: 90, type: 'full_time', typeName: 'full_time' }),
    ];
    expect(getCompletionMarker(events)).toBeNull();
  });

  it('does not treat 2H stoppage minutes as extra time', () => {
    // `simulateMinute(90 + i, 'second_half_injury', true)` — a 93' winner is
    // still regulation and must keep the FT label.
    const events = [
      evt({ minute: 93, type: 'goal', typeName: 'goal', data: { period: 'second_half_injury' } }),
      evt({ minute: 94, type: 'full_time', typeName: 'full_time' }),
    ];
    expect(getCompletionMarker(events)).toBeNull();
  });

  it('detects extra time from the ET kickoff period', () => {
    const events = [
      evt({ minute: 90, type: 'full_time', typeName: 'full_time' }),
      evt({ minute: 90, type: 'kickoff', typeName: 'kickoff', data: { period: 'extra_time' } }),
      evt({ minute: 105, type: 'half_time', typeName: 'half_time', data: { period: 'extra_time_half_time' } }),
      evt({ minute: 120, type: 'full_time', typeName: 'full_time' }),
    ];
    expect(getCompletionMarker(events)).toBe('extraTime');
  });

  it('detects a penalty shootout and outranks plain extra time', () => {
    const events = [
      evt({ minute: 90, type: 'kickoff', typeName: 'kickoff', data: { period: 'extra_time' } }),
      evt({ minute: 120, type: 'full_time', typeName: 'full_time' }),
      // `simulatePenaltyShootout()` closes with this shape.
      evt({
        minute: 120,
        type: 'full_time',
        typeName: 'full_time',
        data: { homeScore: 4, awayScore: 3, isPenalty: true },
      }),
    ];
    expect(getCompletionMarker(events)).toBe('shootout');
  });

  it('still finds the shootout marker when later rows are appended', () => {
    const events = [
      evt({ minute: 120, type: 'full_time', typeName: 'full_time', data: { isPenalty: true } }),
      // Post-match bookkeeping (settlement / summary rows) after the whistle.
      evt({ minute: 120, type: 'match_end', typeName: 'match_end' }),
    ];
    expect(getCompletionMarker(events)).toBe('shootout');
  });
});

describe('getCompletionInfo', () => {
  it('reports the regulation scoreline and no shootout tally', () => {
    const events = [
      evt({ minute: 90, type: 'full_time', typeName: 'full_time', data: { homeScore: 2, awayScore: 1 } }),
    ];
    expect(getCompletionInfo(events)).toEqual({
      marker: null,
      finalScore: { home: 2, away: 1 },
      penaltyScore: null,
    });
  });

  it('keeps the 120\' score as the football result and the shootout as the tally', () => {
    // The exact shape `simulateExtraTime` + `simulatePenaltyShootout` produce:
    // the ET whistle carries 1-1, then the shootout rewrites the stored score
    // to 4-3 and pushes its own `full_time` row.
    const events = [
      evt({ minute: 90, type: 'full_time', typeName: 'full_time', data: { homeScore: 1, awayScore: 1 } }),
      evt({ minute: 90, type: 'kickoff', typeName: 'kickoff', data: { period: 'extra_time' } }),
      evt({ minute: 120, type: 'full_time', typeName: 'full_time', data: { homeScore: 1, awayScore: 1 } }),
      evt({
        minute: 120,
        type: 'full_time',
        typeName: 'full_time',
        data: { homeScore: 4, awayScore: 3, isPenalty: true },
      }),
    ];
    expect(getCompletionInfo(events)).toEqual({
      marker: 'shootout',
      finalScore: { home: 1, away: 1 },
      penaltyScore: { home: 4, away: 3 },
    });
  });

  it('reports the 120\' scoreline for extra time without a shootout', () => {
    const events = [
      evt({ minute: 90, type: 'full_time', typeName: 'full_time', data: { homeScore: 0, awayScore: 0 } }),
      evt({ minute: 90, type: 'kickoff', typeName: 'kickoff', data: { period: 'extra_time' } }),
      evt({ minute: 120, type: 'full_time', typeName: 'full_time', data: { homeScore: 2, awayScore: 1 } }),
    ];
    expect(getCompletionInfo(events)).toEqual({
      marker: 'extraTime',
      finalScore: { home: 2, away: 1 },
      penaltyScore: null,
    });
  });

  it('leaves finalScore null when no whistled score was recorded', () => {
    // Defensive: the hero must fall back to the stored columns, not render 0-0.
    const events = [
      evt({ minute: 120, type: 'full_time', typeName: 'full_time', data: { isPenalty: true } }),
    ];
    expect(getCompletionInfo(events)).toEqual({
      marker: 'shootout',
      finalScore: null,
      penaltyScore: null,
    });
  });

  it('ignores a stray isPenalty row that has no score payload', () => {
    const events = [
      evt({ minute: 90, type: 'full_time', typeName: 'full_time', data: { homeScore: 3, awayScore: 0 } }),
      evt({ minute: 120, type: 'full_time', typeName: 'full_time', data: { isPenalty: true } }),
    ];
    expect(getCompletionInfo(events).penaltyScore).toBeNull();
  });
});
