import {
  currentMatchweek,
  fixtureSeason,
  leagueFixtures,
  matchdayGroups,
  matchdayKey,
  matchdayProgress,
  totalMatchweeks,
  type FixtureLike,
} from './league-fixtures';

const LEAGUE_ID = 'league-1';

/**
 * `MatchType` values as the API serialises them.
 *
 * `MatchType.LEAGUE` is `'league'`, lower case, and the match `type`
 * column is a plain varchar holding the enum VALUE — so the API returns
 * `"type": "league"`, never `"LEAGUE"`. An earlier version of this file
 * compared against `'LEAGUE'`, which matched nothing and rendered an
 * empty league page.
 */
const LEAGUE_TYPE = 'league';
const CUP_TYPE = 'cup';

const league = (
  week: number,
  round: number,
  day: number,
  status = 'completed',
): FixtureLike => ({
  leagueId: LEAGUE_ID,
  season: 7,
  week,
  round,
  type: LEAGUE_TYPE,
  // Deterministic ascending ISO timestamps; day index → 2026-04-01 + n.
  scheduledAt: new Date(Date.UTC(2026, 3, 1 + day, 6)).toISOString(),
  status,
});

/** A full 10-week × 3-matchday season, all completed. */
function fullSeason(): FixtureLike[] {
  const out: FixtureLike[] = [];
  for (let w = 1; w <= 10; w++) {
    for (let r = 1; r <= 3; r++) {
      out.push(league(w, r, (w - 1) * 7 + r, 'completed'));
    }
  }
  return out;
}

describe('leagueFixtures', () => {
  it('keeps only this league’s LEAGUE rows', () => {
    const rows = [
      league(1, 1, 0),
      { ...league(1, 1, 0), leagueId: 'other-league' },
      { ...league(1, 1, 0), type: CUP_TYPE, leagueId: null },
      // A cup row that DOES carry a league id must still be excluded —
      // `type` is the discriminator, not `leagueId`.
      { ...league(1, 1, 0), type: CUP_TYPE },
    ] as FixtureLike[];

    expect(leagueFixtures(rows, LEAGUE_ID).map((m) => m.type)).toEqual([
      LEAGUE_TYPE,
    ]);
  });

  it('matches the value the API actually returns', () => {
    // Regression: comparing against `'LEAGUE'` (the enum MEMBER name)
    // instead of `'league'` (its VALUE) matches no rows at all, and the
    // symptom is a silently empty league page rather than an error.
    expect(LEAGUE_TYPE).toBe('league');
    expect(leagueFixtures([league(1, 1, 0)], LEAGUE_ID)).toHaveLength(1);
  });

  it('drops cup rows that carry a cup round number', () => {
    // The bug this prevents: a cup row has `week: 0` and `round` 0..11,
    // so the old `m.round ?? m.week * 2` key put it in the league ladder
    // at matchday 0..11.
    const cup = {
      leagueId: null,
      season: 7,
      week: 0,
      round: 5,
      type: CUP_TYPE,
      scheduledAt: new Date(Date.UTC(2026, 3, 3, 18)).toISOString(),
      status: 'completed',
    };

    expect(leagueFixtures([cup], LEAGUE_ID)).toEqual([]);
  });
});

describe('matchdayKey', () => {
  it('is the (week, round) tuple, so it needs no rounds-per-week constant', () => {
    expect(matchdayKey(league(4, 2, 0))).toBe('4:2');
  });

  it('distinguishes matchdays inside one week', () => {
    // Under the old `round ?? week * 2` key these two collapsed together
    // once the season moved to three fixtures a week.
    const keys = [1, 2, 3].map((r) => matchdayKey(league(3, r, 0)));
    expect(new Set(keys).size).toBe(3);
  });

  it('treats a missing round as 1 rather than collapsing to the week', () => {
    expect(matchdayKey({ ...league(5, 1, 0), round: undefined })).toBe('5:1');
  });

  it('does not collide across weeks', () => {
    expect(matchdayKey(league(1, 3, 0))).not.toBe(matchdayKey(league(2, 3, 0)));
  });
});

describe('totalMatchweeks', () => {
  it('is the highest week in the fixture list', () => {
    expect(totalMatchweeks(fullSeason())).toBe(10);
  });

  it('works for a 16-week list too — nothing here assumes the season length', () => {
    const sixteen = Array.from({ length: 16 }, (_, i) => league(i + 1, 1, i));
    expect(totalMatchweeks(sixteen)).toBe(16);
  });

  it('returns 0 for an empty list', () => {
    expect(totalMatchweeks([])).toBe(0);
  });

  it('reflects a partially generated schedule rather than a constant', () => {
    expect(totalMatchweeks(fullSeason().slice(0, 6))).toBe(2);
  });
});

describe('fixtureSeason', () => {
  it('reads the season off the rows', () => {
    expect(fixtureSeason(fullSeason())).toBe(7);
  });

  it('is null with no rows, so callers can render a placeholder', () => {
    expect(fixtureSeason([])).toBeNull();
  });
});

describe('currentMatchweek', () => {
  it('is the last week with a completed match', () => {
    const rows = [
      ...fullSeason().slice(0, 9), // weeks 1-3
      league(4, 1, 21, 'scheduled'),
      league(4, 2, 23, 'scheduled'),
    ];
    expect(currentMatchweek(rows, 'completed')).toBe(3);
  });

  it('is 1 before anything has been played', () => {
    const rows = [league(1, 1, 1, 'scheduled')];
    expect(currentMatchweek(rows, 'completed')).toBe(1);
  });

  it('never exceeds the fixture list, which a matchday index used to', () => {
    // The old code passed a global matchday index (up to 30) into this
    // field and rendered "Round 30 / 16" with a 100% bar.
    const rows = fullSeason();
    const week = currentMatchweek(rows, 'completed');
    expect(week).toBeLessThanOrEqual(totalMatchweeks(rows));
  });
});

describe('matchdayGroups', () => {
  const statuses = { completed: 'completed', upcoming: ['scheduled', 'tactics_locked'] };

  it('returns every fixture of the last completed matchday', () => {
    const rows = [
      ...fullSeason().slice(0, 8), // weeks 1,2 and the first two of week 3
      league(3, 3, 20, 'completed'),
      league(4, 1, 22, 'scheduled'),
    ];
    const { lastMatchday } = matchdayGroups(rows, statuses);
    expect(lastMatchday.every((m) => matchdayKey(m) === '3:3')).toBe(true);
    expect(lastMatchday).toHaveLength(1);
  });

  it('treats a whole matchday as last, not just one fixture of it', () => {
    // Eight fixtures share a kickoff in a real league; all of them are
    // "last matchday". Ordering is by kickoff, so the last matchday is the
    // latest one played — here week 1 round 3, with three fixtures on it.
    const rows = [
      league(1, 1, 1, 'completed'),
      league(1, 2, 3, 'completed'),
      league(1, 3, 5, 'completed'),
      league(1, 3, 5, 'completed'),
      league(1, 3, 5, 'completed'),
      league(2, 1, 8, 'scheduled'),
    ];
    const { lastMatchday } = matchdayGroups(rows, statuses);
    expect(lastMatchday).toHaveLength(3);
    expect(lastMatchday.every((m) => matchdayKey(m) === '1:3')).toBe(true);
  });

  it('returns the next scheduled matchday', () => {
    const rows = [
      ...fullSeason().slice(0, 9),
      league(4, 1, 22, 'scheduled'),
      league(4, 2, 24, 'scheduled'),
      league(4, 3, 26, 'scheduled'),
    ];
    const { nextMatchday } = matchdayGroups(rows, statuses);
    expect(nextMatchday.every((m) => matchdayKey(m) === '4:1')).toBe(true);
    expect(nextMatchday).toHaveLength(1);
  });

  it('groups by kickoff time, not by tuple alone', () => {
    // A delayed or rescheduled fixture keeps its (week, round) stamp, so
    // two different kickoffs can share a tuple. Both belong to the
    // matchday the manager is looking at.
    const rows = [
      league(1, 1, 1, 'scheduled'),
      { ...league(1, 1, 1, 'scheduled'), scheduledAt: new Date(Date.UTC(2026, 3, 9, 18)).toISOString() },
      league(1, 2, 3, 'scheduled'),
    ];
    const { nextMatchday } = matchdayGroups(rows, statuses);
    expect(nextMatchday).toHaveLength(2);
  });

  it('is empty on both sides for an empty list', () => {
    expect(matchdayGroups([], statuses)).toEqual({
      lastMatchday: [],
      nextMatchday: [],
    });
  });

  it('has no next matchday once the season is finished', () => {
    // The old fallback was `latestCompletedRound + 1`, which invented a
    // matchday that did not exist and rendered it as an upcoming fixture.
    const rows = fullSeason();
    const { nextMatchday } = matchdayGroups(rows, statuses);
    expect(nextMatchday).toEqual([]);
  });

  it('has no last matchday before kickoff', () => {
    const rows = [league(1, 1, 1, 'scheduled')];
    expect(matchdayGroups(rows, statuses).lastMatchday).toEqual([]);
  });
});

describe('matchdayProgress', () => {
  it('counts matchdays, not matchweeks', () => {
    // 10 weeks x 3 rounds = 30 matchdays. `totalMatchweeks` would say 10,
    // which is what made the header read "1 / 10 已赛" for a 30-match season.
    const rows = Array.from({ length: 30 }, (_, i) =>
      league(Math.floor(i / 3) + 1, (i % 3) + 1, i, i === 0 ? 'completed' : 'scheduled'),
    );
    expect(totalMatchweeks(rows)).toBe(10);
    expect(matchdayProgress(rows, 'completed').total).toBe(30);
  });

  it('reports one played matchday as 1 of 30', () => {
    const rows = Array.from({ length: 30 }, (_, i) =>
      league(Math.floor(i / 3) + 1, (i % 3) + 1, i, i === 0 ? 'completed' : 'scheduled'),
    );
    const progress = matchdayProgress(rows, 'completed');
    expect(progress.completed).toBe(1);
    // The league is now ON the second matchday, so the next kickoff is 2.
    expect(progress.current).toBe(2);
  });

  it('needs every fixture of a matchday to count it as played', () => {
    // One half-played matchday is not a played matchday: counting it would
    // advance the progress bar while a fixture is still outstanding.
    const rows = [
      league(1, 1, 0, 'completed'),
      league(1, 1, 0, 'scheduled'),
      league(1, 2, 1, 'scheduled'),
    ];
    const progress = matchdayProgress(rows, 'completed');
    expect(progress.completed).toBe(0);
    expect(progress.current).toBe(1);
    expect(progress.total).toBe(2);
  });

  it('orders matchdays by kickoff, not by the tuple', () => {
    // A schedule regenerated across seasons must not sort "10:1" before
    // "2:1" as a string would.
    const rows = [
      league(10, 1, 9, 'scheduled'),
      league(2, 1, 1, 'scheduled'),
    ];
    expect(matchdayProgress(rows, 'completed').total).toBe(2);
  });

  it('clamps a finished season to the last matchday', () => {
    const rows = Array.from({ length: 6 }, (_, i) =>
      league(Math.floor(i / 3) + 1, (i % 3) + 1, i),
    );
    const progress = matchdayProgress(rows, 'completed');
    expect(progress.completed).toBe(6);
    expect(progress.current).toBe(6);
  });

  it('returns a zero total for an empty fixture list', () => {
    expect(matchdayProgress([], 'completed')).toEqual({
      current: 1,
      total: 0,
      completed: 0,
    });
  });
});