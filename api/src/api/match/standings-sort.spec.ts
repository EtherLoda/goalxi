import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import {
  STANDINGS_SORT_SQL,
  compareStandings,
} from './standings-sort';

const API_SRC = join(__dirname, '..');

function collectFiles(dir: string, suffix: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === 'dist') continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...collectFiles(full, suffix));
    else if (full.endsWith(suffix)) out.push(full);
  }
  return out;
}

/** Strip comments so a sort key quoted in prose isn't counted as code. */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

/**
 * Every place that orders the league table must use the SAME key.
 *
 * ## What this pins
 *
 * Four independent implementations used to sort the standings, and they
 * could disagree:
 *
 *   - `match-completion.service.ts` → `recalculateLeaguePositions`
 *   - `league/league.service.ts` → `getStandings`
 *   - `league/league-structure.service.ts` → `getLeagueStandings`
 *   - `league/league-structure.service.ts` → `updateStandingsPositions`
 *
 * Three sorted by the COMPUTED expression `goalsFor - goalsAgainst`; one
 * (`getLeagueStandings`) sorted by the STORED `goal_difference` column.
 * They agreed numerically only because `updateLeagueStandings` happened to
 * keep that column in sync — a coupling with no test and no comment
 * explaining it.
 *
 * Worse, all four stopped at three keys. Two teams tied on (points, GD, GF)
 * got an ARBITRARY rank from Postgres heap order — and promotion,
 * relegation, playoff qualification and prize money all select by exact
 * `position === N`, so a tie silently decided who got promoted and who got
 * paid.
 *
 * The tests below check the key is present everywhere AND that the SQL and
 * JS forms agree, because `STANDINGS_SORT_SQL` and `compareStandings` are
 * two encodings of one contract.
 */
describe('standings sort key (contract)', () => {
  const SORT_CALL =
    /\.orderBy\(\s*['"]s\.points['"],\s*['"]DESC['"]\s*\)[\s\S]*?\.getMany\(\)/;

  const standingsFiles = [
    join(API_SRC, 'match', 'match-completion.service.ts'),
    join(API_SRC, 'league', 'league.service.ts'),
    join(API_SRC, 'league', 'league-structure.service.ts'),
  ];

  it('finds every file that sorts the standings table', () => {
    // Guards against the glob below silently matching nothing.
    const withSort = standingsFiles.filter((f) =>
      SORT_CALL.test(stripComments(readFileSync(f, 'utf8'))),
    );
    expect(withSort.length).toBeGreaterThanOrEqual(3);
  });

  it('every standings sort uses the full deterministic key', () => {
    const offenders: string[] = [];

    for (const file of standingsFiles) {
      const src = stripComments(readFileSync(file, 'utf8'));
      const calls = src.match(
        /\.orderBy\(\s*['"]s\.points['"],\s*['"]DESC['"]\s*\)[\s\S]*?\.getMany\(\)/g,
      );
      if (!calls) continue;

      for (const call of calls) {
        const missing = [
          ['s.goalsFor - s.goalsAgainst', 'GD (computed expression)'],
          ['s.goalsFor', 'goals for'],
          ['s.wins', 'wins (4th tie-break)'],
          ['s.goalsAgainst', 'goals against (5th tie-break)'],
          ['s.teamId', 'teamId (final deterministic tie-break)'],
        ].filter(([needle]) => !call.includes(needle as string));

        if (missing.length > 0) {
          offenders.push(
            `${file}: missing ${missing.map((m) => m[1]).join(', ')}`,
          );
        }
      }
    }

    expect(offenders).toEqual([]);
  });

  it('no standings sort uses the stored goal_difference column', () => {
    // The column IS maintained now, but sorting on a derived column
    // couples the read path to the write path with no test and no
    // documented reason. The computed expression is the canonical key.
    const offenders: string[] = [];
    for (const file of standingsFiles) {
      const src = stripComments(readFileSync(file, 'utf8'));
      if (/order:\s*\{[^}]*goalDifference/.test(src)) {
        offenders.push(file);
      }
    }
    expect(offenders).toEqual([]);
  });

  describe('STANDINGS_SORT_SQL and compareStandings agree', () => {
    // A representative team. `id` doubles as `teamId`.
    const team = (
      id: string,
      points: number,
      goalsFor: number,
      goalsAgainst: number,
      wins: number,
    ) => ({
      teamId: id,
      points,
      goalsFor,
      goalsAgainst,
      wins,
    });

    it('ranks by points first', () => {
      const a = team('a', 10, 5, 5, 3);
      const b = team('b', 9, 30, 0, 3);
      expect(compareStandings(a, b)).toBeLessThan(0);
      expect(STANDINGS_SORT_SQL[0]).toBe('points DESC');
    });

    it('breaks a points tie on goal difference', () => {
      const better = team('a', 10, 8, 2, 3); // GD +6
      const worse = team('b', 10, 4, 4, 3); // GD 0
      expect(compareStandings(better, worse)).toBeLessThan(0);
      expect(STANDINGS_SORT_SQL[1]).toBe('(goals_for - goals_against) DESC');
    });

    it('breaks a GD tie on goals for', () => {
      const better = team('a', 10, 6, 4, 1); // GD +2, GF 6
      const worse = team('b', 10, 5, 3, 3); // GD +2, GF 5
      expect(compareStandings(better, worse)).toBeLessThan(0);
      expect(STANDINGS_SORT_SQL[2]).toBe('goals_for DESC');
    });

    it('REGRESSION: breaks a (points, GD, GF) tie on wins', () => {
      // Previously a total tie on the first three keys fell through to
      // database row order, so promotion / relegation / playoff
      // qualification / prize money were decided arbitrarily.
      const moreWins = team('a', 10, 5, 3, 4); // GD +2, GF 5
      const fewerWins = team('b', 10, 5, 3, 1); // GD +2, GF 5
      expect(compareStandings(fewerWins, moreWins)).toBeGreaterThan(0);
      expect(STANDINGS_SORT_SQL[3]).toBe('wins DESC');
    });

    it('REGRESSION: breaks a (points, GD, GF, wins) tie on goals against', () => {
      const betterDefence = team('a', 10, 5, 3, 2); // GA 3
      const worseDefence = team('b', 10, 5, 3, 2); // GA 3 — equal
      const leaky = team('c', 10, 5, 3, 2);
      // Make GA differ while keeping the first four keys equal.
      const a2 = { ...betterDefence, goalsAgainst: 3 };
      const b2 = { ...worseDefence, goalsAgainst: 9 };
      expect(compareStandings(a2, b2)).toBeLessThan(0);
      expect(STANDINGS_SORT_SQL[4]).toBe('goals_against ASC');
      expect(leaky.teamId).toBe('c');
    });

    it('REGRESSION: a total tie is broken by teamId, deterministically', () => {
      // This is the property that makes promotion reproducible: two teams
      // with identical records must always rank the same way, in every
      // reader, on every re-run.
      const a = team('aaa', 10, 5, 3, 2);
      const b = team('bbb', 10, 5, 3, 2);
      expect(compareStandings(a, b)).toBeLessThan(0);
      expect(compareStandings(b, a)).toBeGreaterThan(0);
      expect(STANDINGS_SORT_SQL[5]).toBe('team_id ASC');

      // Anti-symmetric and never 0 for distinct teams.
      const rows = [
        team('t3', 10, 5, 3, 2),
        team('t1', 10, 5, 3, 2),
        team('t2', 10, 5, 3, 2),
      ];
      expect([...rows].sort(compareStandings).map((r) => r.teamId)).toEqual([
        't1',
        't2',
        't3',
      ]);
    });
  });
});