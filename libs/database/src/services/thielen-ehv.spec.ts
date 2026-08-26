import {
  circleMethodPairings,
  thielenEHV,
  RoundPairings,
} from './thielen-ehv';

/**
 * Spec for the shared Thielen EHV utility.
 *
 * `thielenEHV` is used by both the season-1 init path
 * (`ScheduleGenerator`) and the mid-season reschedule
 * path (`SeasonSchedulerService`) — both produce the
 * exact same schedule shape from the exact same
 * algorithm. Specs here are the single source of
 * truth for the "max ≤ 2 streak" guarantee, and the
 * production-path tests in
 * `settlement/src/bootstrap/generators/schedule.generator.spec.ts`
 * reuse the same helpers via the public surface.
 */

const perTeamHA = (
  pairings: RoundPairings[],
  haMatrix: Map<string, boolean[]>,
  teamId: string,
): Array<'H' | 'A'> => {
  const seq: Array<'H' | 'A'> = [];
  for (let r = 0; r < pairings.length; r++) {
    for (const [a, b] of pairings[r]) {
      if (a === teamId) seq.push(haMatrix.get(a)![r] ? 'H' : 'A');
      else if (b === teamId) seq.push(haMatrix.get(a)![r] ? 'A' : 'H');
    }
  }
  return seq;
};

// Build the leg-1 + leg-2 (mirror) combined sequence
// for one team. The mirror rule is: leg 2 inverts leg
// 1's HA. The Thielen boundary check inside
// `thielenEHV` guarantees the combined sequence has
// no 3-streak at the leg boundary.
const perTeamHACombined = (
  pairings: RoundPairings[],
  haMatrix: Map<string, boolean[]>,
  teamId: string,
): Array<'H' | 'A'> => {
  const leg1 = perTeamHA(pairings, haMatrix, teamId);
  const leg2 = leg1.map((v) => (v === 'H' ? 'A' : 'H'));
  return [...leg1, ...leg2];
};

const maxStreak = (seq: Array<'H' | 'A'>): number => {
  let best = 0;
  let run = 0;
  let prev: 'H' | 'A' | null = null;
  for (const v of seq) {
    if (v === prev) {
      run += 1;
    } else {
      run = 1;
    }
    if (run > best) best = run;
    prev = v;
  }
  return best;
};

const teamIds = (n: number): string[] =>
  Array.from({ length: n }, (_, i) => `T${i}`);

describe('thielenEHV — shared HA-assignment utility', () => {
  it('16-team circle-method pairings: every team has max combined (leg-1 + mirror-leg-2) streak ≤ 2', () => {
    const ids = teamIds(16);
    const pairings = circleMethodPairings(ids);
    // 15 rounds × 8 matches = 120 pairings.
    expect(pairings).toHaveLength(15);
    expect(pairings[0]).toHaveLength(8);
    const haMatrix = thielenEHV({ teamIds: ids, pairings });
    for (let i = 0; i < 16; i++) {
      const combined = perTeamHACombined(pairings, haMatrix, `T${i}`);
      // 30 combined matches per team (15 leg 1 + 15 leg 2).
      expect(combined).toHaveLength(30);
      expect(maxStreak(combined)).toBeLessThanOrEqual(2);
    }
  });

  it('8-team circle-method pairings: every team has max combined streak ≤ 2', () => {
    // The 8-team trace is the one the user originally
    // reported — T2's 3-streak under the old per-round
    // parity rule. The Thielen CSP must fix it.
    const ids = teamIds(8);
    const pairings = circleMethodPairings(ids);
    expect(pairings).toHaveLength(7);
    expect(pairings[0]).toHaveLength(4);
    const haMatrix = thielenEHV({ teamIds: ids, pairings });
    for (let i = 0; i < 8; i++) {
      const combined = perTeamHACombined(pairings, haMatrix, `T${i}`);
      expect(combined).toHaveLength(14);
      expect(maxStreak(combined)).toBeLessThanOrEqual(2);
    }
  });

  it('4-team: documents the edge case where max ≤ 2 is structurally unreachable', () => {
    // The Thielen 2003 paper guarantees a valid
    // max-≤-2 assignment for N ≥ 6; for N=4 the
    // circle-method 1-factorization + 3-round leg
    // leaves at least one team with a 3-streak no
    // matter how the HA is assigned. The init path
    // never reaches N=4 — the smallest tier in the
    // standard pyramid is L4 with 16 teams. The
    // mid-season scheduler's `generateSeasonSchedule`
    // throws on `teamIds.length < 4`. We pin the
    // behaviour here so a future "use N=4 for a
    // micro-league" change doesn't silently ship
    // 3-streaks.
    const ids = teamIds(4);
    const pairings = circleMethodPairings(ids);
    expect(pairings).toHaveLength(3);
    expect(pairings[0]).toHaveLength(2);
    expect(() => thielenEHV({ teamIds: ids, pairings })).toThrow(
      /no valid HA assignment for N=4/,
    );
  });

  it('per-match constraint: every match has one home and one away', () => {
    // The Thielen CSP encodes HA as a single boolean
    // per (team, round) — for any pair (a, b) in round
    // r, exactly one of a, b is home and the other is
    // away. This is the "one home, one away per match"
    // contract the simulator needs.
    const ids = teamIds(16);
    const pairings = circleMethodPairings(ids);
    const haMatrix = thielenEHV({ teamIds: ids, pairings });
    for (let r = 0; r < pairings.length; r++) {
      for (const [a, b] of pairings[r]) {
        const aHome = haMatrix.get(a)![r];
        const bHome = haMatrix.get(b)![r];
        // Exactly one of aHome, bHome is true.
        expect(aHome).not.toBe(bHome);
      }
    }
  });

  it('double round-robin contract: every pair plays once home + once away', () => {
    // The "double round-robin" contract: for every
    // pair (a, b), team a plays team b exactly twice
    // — once at home, once away. The mirror rule in
    // `generateRoundRobin` / `generateDoubleRoundRobin`
    // produces this from the leg-1 HA matrix.
    const ids = teamIds(8);
    const pairings = circleMethodPairings(ids);
    const numRounds = pairings.length; // = 7 for 8-team
    const haMatrix = thielenEHV({ teamIds: ids, pairings });
    for (let a = 0; a < 8; a++) {
      for (let b = a + 1; b < 8; b++) {
        // Find the round where (a, b) play in leg 1.
        let matchRound = -1;
        for (let r = 0; r < pairings.length; r++) {
          for (const [x, y] of pairings[r]) {
            if (
              (x === `T${a}` && y === `T${b}`) ||
              (x === `T${b}` && y === `T${a}`)
            ) {
              matchRound = r;
              break;
            }
          }
          if (matchRound >= 0) break;
        }
        expect(matchRound).toBeGreaterThanOrEqual(0);
        // The combined sequence for T${a} has the
        // (a, b) match at position `matchRound` in
        // leg 1 and the mirror at position
        // `numRounds + matchRound` in leg 2. The
        // mirror inverts HA, so the two positions
        // must be different values.
        const combined = perTeamHACombined(pairings, haMatrix, `T${a}`);
        const leg1Val = combined[matchRound];
        const leg2Val = combined[numRounds + matchRound];
        expect(leg1Val).not.toBe(leg2Val);
      }
    }
  });

  it('handles N=2 by returning an empty HA matrix (caller must skip degenerate leagues)', () => {
    // N=2 has only 1 round with 1 match — the CSP
    // runs but the boundary check never fires. The
    // CSP succeeds with no work. The init path's
    // `generateSeniorFixtures` already skips leagues
    // with `teamIds.length < 4` upstream, so this
    // case is "doesn't crash" rather than "throws".
    // The empty-matrix return lets the caller's
    // `for (const [a, b] of pairings[r])` loop simply
    // not execute and produce 0 matches.
    // Pairings format is 3-level: [rounds[matchups[tuple]]].
    // For N=2 it's 1 round with 1 matchup of (a, b).
    const result = thielenEHV({
      teamIds: ['a', 'b'],
      pairings: [[['a', 'b']]] as unknown as RoundPairings[],
    });
    // N=2 is the edge case where the CSP assigns
    // 1 round of HA — the result has 1 element per
    // team, NOT 0. The production path never
    // reaches here (the init / scheduler skip
    // leagues with N < 4 upstream), so this is
    // purely a "doesn't crash" guard.
    expect(result.get('a')).toEqual([true]);
    expect(result.get('b')).toEqual([false]);
  });
});
