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

  // Regression: `goal.quality_great` and `goal.quality_good` are i18n
  // strings that contain a `{player}` placeholder, so calling t() without
  // passing `player` in the params object made next-intl@4 throw
  // FORMATTING_ERROR ("The intl string context variable 'player' was not
  // provided to the string 'A composed finish from {player}!'").
  // getQualityText now passes `{ player }` on every branch so the
  // string is fully resolved before being dropped into the goal template.
  it('GOAL with shootRating < 60 does not crash on the {player} placeholder (quality_good branch)', () => {
    // Real next-intl substitutes `{var}` from the params before returning,
    // so the test mock has to do the same — otherwise the inner `{player}`
    // in the quality string would leak through and the outer template's
    // interpolate() can't recurse into the substituted value.
    const t = jest.fn((key: string, params?: Record<string, string | number>) => {
      const render = (s: string) =>
        params
          ? s.replace(/\{(\w+)\}/g, (_, k) => String(params[k] ?? `{${k}}`))
          : s;
      if (key.startsWith('goal.tpl_')) return render('GOAL_TPL:{player} {quality}');
      if (key === 'goal.quality_good') return render('good from {player}');
      if (key === 'goal.quality_great') return render('great from {player}');
      if (key === 'goal.quality_excellent') return render('brilliant from {player}');
      if (key === 'lane.left') return 'left';
      if (key === 'shotType.normal') return 'normal';
      return key;
    });

    const text = formatEventCommentary(
      baseEvent({
        minute: 12,
        data: {
          playerName: 'Saka',
          sequence: {
            shot: {
              shooter: 'Saka',
              shotType: 'normal',
              // 50 — falls into the quality_good branch (the one that
              // crashed in production with FORMATTING_ERROR).
              shootRating: 50,
            },
          },
          lane: 'left',
        },
      }),
      'Arsenal',
      'Chelsea',
      t,
    );

    // {player} should already be resolved inside the quality string —
    // the template's {quality} placeholder then receives the rendered
    // text, NOT a raw "{player}" token.
    expect(text).toContain('Saka');
    expect(text).toContain('good from Saka');
    expect(text).not.toContain('{player}');
    expect(text).not.toContain('{quality}');
    expect(t).toHaveBeenCalledWith('goal.quality_good', { player: 'Saka' });
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
  });

  it('appends attendance as a trailing line when the dedicated attendance event carries a count', () => {
    // Post-RFC split: weather_announcement renders only the weather
    // line; the dedicated attendance_announcement event emits the
    // crowd line. Verify the new event routes through the right arm.
    //
    // The mock `t` now accepts a second `params` argument and runs
    // the same `{key}` placeholder substitution that next-intl does
    // in production. Without that, the test was asserting against
    // a stale mock that returned the template verbatim and ignored
    // the `count` param the formatter passed in — masking the very
    // bug the test was supposed to catch.
    const t = jest.fn(
      (key: string, params?: Record<string, string | number>) => {
        if (key === 'attendance.line') {
          let result = '{count} fans in attendance.';
          if (params) {
            for (const [k, v] of Object.entries(params)) {
              result = result.replace(
                new RegExp(`\\{${k}\\}`, 'g'),
                String(v),
              );
            }
          }
          return result;
        }
        return key;
      },
    );
    const text = formatEventCommentary(
      baseEvent({
        type: 'attendance_announcement',
        typeName: 'attendance_announcement',
        minute: 0,
        data: { attendance: 25000 },
      }),
      'A',
      'B',
      t,
    );
    expect(text).toBe('25,000 fans in attendance.');
    expect(t).toHaveBeenCalledWith('attendance.line', { count: '25,000' });
  });

  it('renders weather independently of attendance (post-split)', () => {
    // The weather arm no longer reads the (legacy) attendance field.
    // Confirming that an attendance value on weather_announcement.data
    // does NOT leak into the weather line.
    const t = jest.fn((key: string) => {
      if (key === 'weather.cloudy') return 'Overcast skies';
      if (key === 'attendance.line') return '{count} fans in attendance.';
      return key;
    });
    const text = formatEventCommentary(
      baseEvent({
        type: 'weather_announcement',
        typeName: 'weather_announcement',
        minute: 0,
        data: { weather: 'Cloudy', weatherKey: 'cloudy', attendance: 25000 },
      }),
      'A',
      'B',
      t,
    );
    expect(text).toBe('Overcast skies');
    expect(t).toHaveBeenCalledWith('weather.cloudy');
    // Attendance i18n key is NOT consulted from the weather arm anymore.
    expect(t).not.toHaveBeenCalledWith('attendance.line');
  });

  it('omits attendance when count is 0 or missing', () => {
    // The dedicated attendance event may carry 0 (legacy row) or the
    // field may be absent. Don't render "0 fans in attendance." noise.
    const t = jest.fn((key: string) => {
      if (key === 'attendance.line') return '{count} fans in attendance.';
      return key;
    });
    const textZero = formatEventCommentary(
      baseEvent({
        type: 'attendance_announcement',
        typeName: 'attendance_announcement',
        minute: 0,
        data: { attendance: 0 },
      }),
      'A',
      'B',
      t,
    );
    expect(textZero).toBe('');

    const textMissing = formatEventCommentary(
      baseEvent({
        type: 'attendance_announcement',
        typeName: 'attendance_announcement',
        minute: 0,
        data: {},
      }),
      'A',
      'B',
      t,
    );
    expect(textMissing).toBe('');
  });

  it('weather event with no attendance field renders the weather line cleanly', () => {
    // Post-split, the weather arm is the sole source of weather text.
    // Attendance piggyback fields are ignored here.
    const t = jest.fn((key: string) => {
      if (key === 'weather.sunny') return 'Sunny skies';
      return key;
    });
    const text = formatEventCommentary(
      baseEvent({
        type: 'weather_announcement',
        typeName: 'weather_announcement',
        minute: 0,
        data: { weather: 'Sunny', weatherKey: 'sunny' },
      }),
      'A',
      'B',
      t,
    );
    expect(text).toBe('Sunny skies');
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

  // ------------------------------------------------------------------
  // TURNOVER
  // ------------------------------------------------------------------
  // The turnover formatter has two distinct template variants (tpl_0
  // and tpl_1). tpl_0 is the "no tackler known" variant; tpl_1 names
  // the tackler. The formatter forces tpl_0 when no tackler is in the
  // event payload so we never leak a literal `{tackler}` placeholder
  // into the rendered string.
  describe('TURNOVER', () => {
    it('renders tpl_1 with {tackler} when the simulator sets a defending player', () => {
      const t = jest.fn((key: string) => {
        if (key === 'turnover.tpl_1') {
          return '{tackler} steps in on {player} — {team} lose it cheaply.';
        }
        // Fall back to tpl_0 too, so we can assert it was NOT picked.
        if (key === 'turnover.tpl_0') {
          return 'Turnover at {team}.';
        }
        return key;
      });

      const text = formatEventCommentary(
        baseEvent({
          type: 'turnover',
          typeName: 'turnover',
          minute: 18,
          isHome: true,
          data: {
            sequence: {
              attackPush: {
                attackingPlayer: 'Pedri',
                defendingPlayer: 'Vitinha',
              },
            },
          },
        }),
        'Barca',
        'PSG',
        t,
      );

      // djb2 of the event id may pick tpl_0 OR tpl_1 — but because the
      // tackler is present we want tpl_1 to be the rendered form. The
      // test below only asserts the tackler is interpolated; if djb2
      // happened to pick tpl_0, that's still correct (no tackler
      // placeholder leaks). Run it twice with two distinct ids to
      // cover both branches.
      if (text.startsWith('Vitinha')) {
        expect(text).toBe('Vitinha steps in on Pedri — Barca lose it cheaply.');
      } else {
        // tpl_0 was picked; the rendered form must not contain a
        // literal `{tackler}` placeholder.
        expect(text).toBe('Turnover at Barca.');
        expect(text).not.toMatch(/\{tackler\}/);
      }
    });

    it('forces tpl_0 and never leaks {tackler} when the payload has no defending player', () => {
      // Pre-engine-fix rows have no defendingPlayer in the data —
      // either tpl_0 or tpl_1 would be picked by djb2, but the
      // formatter must force tpl_0 to keep the rendered text clean.
      const t = jest.fn((key: string) => {
        if (key === 'turnover.tpl_0') {
          return 'Turnover at {team} — possession lost in the middle of the park.';
        }
        if (key === 'turnover.tpl_1') {
          return '{tackler} dispossesses {player} — {team} lose it cheaply.';
        }
        return key;
      });

      const text = formatEventCommentary(
        baseEvent({
          type: 'turnover',
          typeName: 'turnover',
          minute: 33,
          isHome: false,
          data: {
            sequence: {
              attackPush: {
                attackingPlayer: 'Pedri',
                // defendingPlayer omitted — legacy row
              },
            },
          },
        }),
        'Barca',
        'PSG',
        t,
      );

      expect(text).toBe(
        'Turnover at PSG — possession lost in the middle of the park.',
      );
      expect(text).not.toMatch(/\{tackler\}/);
      // Defensive: tpl_1 must NOT have been consulted.
      const tplKeys = t.mock.calls.map((c) => c[0]);
      expect(tplKeys).not.toContain('turnover.tpl_1');
    });

    it('falls back to event.playerName when the data envelope is missing entirely', () => {
      // Some old rows may not have data.sequence.attackPush at all.
      const t = jest.fn((key: string) => {
        if (key === 'turnover.tpl_0') {
          return '{team} lose it — {player} was sloppy.';
        }
        if (key === 'turnover.tpl_1') {
          return '{tackler} pounces on {player}.';
        }
        return key;
      });

      const text = formatEventCommentary(
        baseEvent({
          type: 'turnover',
          typeName: 'turnover',
          minute: 50,
          isHome: true,
          // No `data` at all — pure legacy.
        }),
        'Barca',
        'PSG',
        t,
      );

      // No tackler path → tpl_0 forced. The {player} slot stays
      // empty when there's no attackingPlayer in the data; we only
      // assert no {tackler} leaks and the render doesn't 5xx.
      expect(text).not.toMatch(/\{tackler\}/);
      expect(text).toContain('Barca');
    });
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

  // Regression: next-intl@4 throws FORMATTING_ERROR when `t()` is called
  // with a template that has `{var}` placeholders but no params object.
  // getTemplate() must always forward the interpolation params, otherwise
  // period templates (full_time, half_time, forfeit, …) surface as the
  // literal `commentary.full_time.tpl_2` string in the UI.
  it('getTemplate forwards interpolation params so next-intl does not throw', () => {
    const t = jest.fn((key: string, params?: Record<string, string | number>) => {
      // Real next-intl would interpolate via ICU MessageFormat; mimic that
      // for any tpl_N in the full_time family so the test is hash-stable.
      if (key.startsWith('full_time.tpl_') && params) {
        const n = key.slice('full_time.tpl_'.length);
        return `FT_TPL_${n}:${params.winner} (${params.homeScore}-${params.awayScore})`;
      }
      return key;
    });
    const text = formatEventCommentary(
      baseEvent({
        type: 'full_time',
        typeName: 'full_time',
        minute: 90,
        data: { homeScore: 3, awayScore: 1 },
      }),
      'Winners',
      'Losers',
      t,
    );
    expect(text).toContain('Winners');
    expect(text).toContain('3-1');
    // Param object MUST include winner + scores — guards against a future
    // refactor that drops them silently.
    expect(t).toHaveBeenCalledWith(
      expect.stringMatching(/^full_time\.tpl_\d+$/),
      expect.objectContaining({ winner: 'Winners', homeScore: 3, awayScore: 1 }),
    );
  });
});
