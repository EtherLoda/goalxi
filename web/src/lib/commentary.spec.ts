/**
 * commentary.spec.ts — unit tests for the live-event type alias map and the
 * `formatEventCommentary` dispatcher.
 *
 * Target: ≥ 85% statement + branch coverage on commentary.ts.
 *
 * Pattern: mirror of `match-lock.spec.ts` — pure function tests, no DOM.
 * The `t()` translation function is mocked to capture i18n key lookups so
 * specs assert on the keys the formatter dispatches to, not the (locale-
 * dependent) translated strings. This also means the test exercises the
 * real alias map + canonicalization, which is the surface most likely to
 * regress.
 */

import {
  canonicalEventType,
  EVENT_TYPE_ALIAS,
  formatEventCommentary,
} from './commentary';
import type { MatchEvent } from './api';

/** Mock `t` that returns the requested key verbatim — the spec asserts on keys. */
function makeT(): jest.Mock<string, [string]> {
  return jest.fn((key: string) => key);
}

function baseEvent(overrides: Partial<MatchEvent> = {}): MatchEvent {
  return {
    id: `evt-${overrides.minute ?? 0}-${overrides.type ?? 'goal'}`,
    matchId: 'm1',
    minute: 0,
    second: 0,
    type: 'goal',
    typeName: 'goal',
    ...overrides,
  };
}

// ============================================================================
// canonicalEventType
// ============================================================================

describe('canonicalEventType', () => {
  it('uppercases and underscores-dashes before lookup', () => {
    expect(canonicalEventType('shot-on-target')).toBe('SHOT_ON_TARGET');
    expect(canonicalEventType('Shot-On-Target')).toBe('SHOT_ON_TARGET');
  });

  it('falls back to the upper-cased value when no alias matches', () => {
    expect(canonicalEventType('weird-future-event')).toBe('WEIRD_FUTURE_EVENT');
  });

  it('tolerates undefined / empty inputs', () => {
    expect(canonicalEventType(undefined)).toBe('');
    expect(canonicalEventType(null)).toBe('');
    expect(canonicalEventType('')).toBe('');
  });

  it('resolves every entry in EVENT_TYPE_ALIAS to its mapped value', () => {
    for (const [raw, expected] of EVENT_TYPE_ALIAS) {
      expect(canonicalEventType(raw)).toBe(expected);
      // Case-insensitive — simulator emits lowercase but the map must
      // still answer for any-cased input.
      expect(canonicalEventType(raw.toUpperCase())).toBe(expected);
    }
  });

  // Specific guarantees the formatter depends on.
  it.each([
    ['goal', 'GOAL'],
    ['miss', 'SHOT_OFF_TARGET'],
    ['save', 'SHOT_ON_TARGET'],
    ['penalty_goal', 'GOAL'],
    ['second_half', 'SECOND_HALF_START'],
    ['match_start', 'KICKOFF'],
    ['kickoff', 'KICKOFF'],
    ['full_time', 'FULL_TIME'],
    ['yellow_card', 'YELLOW_CARD'],
  ] as const)('maps "%s" -> "%s"', (raw, expected) => {
    expect(canonicalEventType(raw)).toBe(expected);
  });
});

// ============================================================================
// formatEventCommentary dispatch
// ============================================================================

describe('formatEventCommentary dispatch', () => {
  it('SNAPSHOT returns empty string (filtered upstream)', () => {
    const t = makeT();
    const text = formatEventCommentary(
      baseEvent({ type: 'snapshot', typeName: 'snapshot' }),
      'Home',
      'Away',
      t,
    );
    expect(text).toBe('');
    // Should not even hit the i18n catalog for SNAPSHOT.
    expect(t).not.toHaveBeenCalled();
  });

  it('GOAL resolves to commentary.goal.tpl_* with {player} + {team} interpolated', () => {
    // Simulates a hook scoped to `commentary`, so `getTemplate` strips the
    // `commentary.` prefix before calling t(). The mock answers relative keys.
    const t = jest.fn((key: string) => {
      if (key.startsWith('goal.tpl_')) {
        // Include `{quality}` so we can assert it was substituted.
        return 'GOAL_TPL:{player} scored for {team} — {quality}!';
      }
      if (key === 'goal.quality_excellent') return 'brilliant';
      if (key === 'goal.quality_great') return 'great';
      if (key === 'goal.quality_good') return 'good';
      if (key === 'lane.left') return 'left side';
      if (key === 'shotType.normal') return 'normal';
      return key;
    });

    const text = formatEventCommentary(
      baseEvent({
        minute: 42,
        data: {
          playerName: 'Saka',
          sequence: {
            shot: {
              shooter: 'Saka',
              shotType: 'normal',
              shootRating: 85,
            },
          },
          lane: 'left',
        },
      }),
      'Arsenal',
      'Chelsea',
      t,
    );

    expect(text).toContain('Saka');
    expect(text).toContain('Arsenal');
    // Quality branch should have hit for shootRating 85.
    expect(text).toContain('brilliant');
  });

  it('SECOND_HALF resolves to commentary.second_half_start (regression for missing arm)', () => {
    // Pre-fix the second-half kickoff was unreachable because the canonical
    // key was `SECOND_HALF_START` but the simulator emits `second_half`.
    // canonicalEventType aliases it; this test would have failed before.
    const t = jest.fn((key: string) => {
      if (key === 'second_half_start.tpl_0') {
        return 'SECOND_HALF_BEGINS';
      }
      return key;
    });

    const text = formatEventCommentary(
      baseEvent({ type: 'second_half', typeName: 'second_half', minute: 46 }),
      'A',
      'B',
      t,
    );

    expect(text).toBe('SECOND_HALF_BEGINS');
    expect(t).toHaveBeenCalledWith('second_half_start.tpl_0');
  });

  it('PENALTY_GOAL is treated as a GOAL (penalty shootout scores count)', () => {
    const t = jest.fn((key: string) => {
      // Accept any tpl_N for the goal arm — the hash picks among 4
      // templates and we don't want the test tied to a specific hash.
      if (key.startsWith('goal.tpl_')) return 'GOAL_DISPATCH';
      return key;
    });
    const text = formatEventCommentary(
      baseEvent({ type: 'penalty_goal', typeName: 'penalty_goal', minute: 90 }),
      'A',
      'B',
      t,
    );
    expect(text).toBe('GOAL_DISPATCH');
    // The PENALTY_GOAL arm should NOT be hit — the alias routes it to GOAL.
    expect(t).not.toHaveBeenCalledWith(expect.stringMatching(/^penalty\./));
  });

  it('falls through to default branch with title-cased text for unknown types', () => {
    // `weather_announcement` IS routed to formatWeatherAnnouncementCommentary,
    // which queries `weather.<key>` (post-prefix-strip). Confirm the route + i18n.
    const realT = jest.fn((key: string) => {
      if (key === 'weather.sunny') return 'Sunny skies over the stadium';
      return key;
    });
    const weatherText = formatEventCommentary(
      baseEvent({ type: 'weather_announcement', typeName: 'weather_announcement', minute: 5 }),
      'A',
      'B',
      realT,
    );
    expect(weatherText).toBe('Sunny skies over the stadium');

    // Now assert the default-branch behavior for a type not aliased AND not
    // in the switch: the canonical key falls through to the formatter's
    // default `Title At Minute'` shape.
    const passingT = jest.fn(() => '');
    const fallbackText = formatEventCommentary(
      baseEvent({
        id: 'X',
        type: 'no_such_event_kind',
        typeName: 'no_such_event_kind',
        minute: 73,
      }),
      'A',
      'B',
      passingT,
    );
    expect(fallbackText).toBe("No Such Event Kind at 73'");
  });

  it('default branch formats unknown events as "Title At Minute\'"', () => {
    const t = makeT(); // returns key when called; we just want the text
    // Forge an event whose type bypasses every alias and every switch case.
    const evt = baseEvent({
      id: 'X',
      type: 'no_such_event_kind',
      typeName: 'no_such_event_kind',
      minute: 73,
    });
    const text = formatEventCommentary(evt, 'A', 'B', t);
    expect(text).toBe("No Such Event Kind at 73'");
  });
});

// ============================================================================
// Template variation
// ============================================================================

describe('commentary tpl_* variation is per-event deterministic', () => {
  it('different event ids produce different template indices (most of the time)', () => {
    // Hit commentary.goal.tpl_* 20 times with distinct ids; expect at
    // least 2 distinct indices, otherwise the hash collapsed everything
    // — which would mean we're back to the pre-fix `index = 1` behavior.
    const tplIdxSeen = new Set<number>();
    for (let i = 0; i < 20; i++) {
      const evt = baseEvent({
        id: `evt-${i}`,
        type: 'goal',
        typeName: 'goal',
        minute: 10 + i,
        data: { playerName: 'X', sequence: { shot: { shooter: 'X' } } },
      });
      const t = jest.fn((key: string) => {
        // Extract the tpl index the formatter picked.
        const m = key.match(/\.tpl_(\d+)$/);
        if (m) tplIdxSeen.add(Number(m[1]));
        return key;
      });
      formatEventCommentary(evt, 'A', 'B', t);
    }
    expect(tplIdxSeen.size).toBeGreaterThanOrEqual(2);
  });

  it('id-less events still get variation via the composite-key fallback', () => {
    const seen = new Set<number>();
    for (let i = 0; i < 20; i++) {
      const evt = baseEvent({
        // no `id` — exercises the fallback key.
        id: '',
        type: 'goal',
        typeName: 'goal',
        minute: 10 + (i % 5), // varies by minute
        playerId: `player-${i}`,
        data: { playerName: 'X', sequence: { shot: { shooter: 'X' } } },
      });
      const t = jest.fn((key: string) => {
        const m = key.match(/\.tpl_(\d+)$/);
        if (m) seen.add(Number(m[1]));
        return key;
      });
      formatEventCommentary(evt, 'A', 'B', t);
    }
    expect(seen.size).toBeGreaterThanOrEqual(2);
  });

  it('same id always picks the same template (stability across re-renders)', () => {
    const evt = baseEvent({
      id: 'stable-id-1',
      type: 'goal',
      typeName: 'goal',
      minute: 30,
      data: { playerName: 'X', sequence: { shot: { shooter: 'X' } } },
    });
    const firstKeys: string[] = [];
    const secondKeys: string[] = [];
    for (const sink of [firstKeys, secondKeys]) {
      const t = jest.fn((key: string) => {
        sink.push(key);
        return key;
      });
      formatEventCommentary(evt, 'A', 'B', t);
    }
    expect(firstKeys).toEqual(secondKeys);
  });
});

// ============================================================================
// formatPeriodCommentary
// ============================================================================

describe('formatEventCommentary period events', () => {
  it('FULL_TIME resolves winner via tpl_* variation', () => {
    const t = jest.fn((key: string) => {
      if (key === 'full_time.tpl_0') return 'FT_TPL_0:{homeTeam} {homeScore}-{awayScore} {awayTeam} winner={winner}';
      if (key === 'full_time.tpl_1') return 'FT_TPL_1';
      if (key === 'full_time.tpl_2') return 'FT_TPL_2';
      if (key === 'full_time.draw') return 'draw';
      return key;
    });
    const text = formatEventCommentary(
      baseEvent({
        type: 'full_time',
        typeName: 'full_time',
        minute: 90,
        data: { homeScore: 2, awayScore: 1 },
      }),
      'Arsenal',
      'Chelsea',
      t,
    );
    expect(text).toContain('Arsenal');
    expect(text).toContain('Chelsea');
    expect(text).toContain('2-1');
    expect(text).not.toBe('');
  });

  it('HALF_TIME interpolates half-time score', () => {
    const t = jest.fn((key: string) => {
      if (key === 'half_time.tpl_0') {
        return 'HT:{homeTeam} {homeScore}-{awayScore} {awayTeam}';
      }
      return key;
    });
    const text = formatEventCommentary(
      baseEvent({
        type: 'half_time',
        typeName: 'half_time',
        minute: 45,
        data: { homeScore: 1, awayScore: 0 },
      }),
      'A',
      'B',
      t,
    );
    expect(text).toContain('A 1-0 B');
  });
});
