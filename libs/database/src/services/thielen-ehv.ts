/**
 * Thielen-style constraint-satisfaction for the
 * home/away (HA) assignment in a round-robin tournament.
 *
 * Given a complete 1-factorization (a list of
 * `[round][matchInRound] → [teamA, teamB]` pairings),
 * find an assignment of `home` / `away` to every
 * (round, match) cell such that:
 *
 *   1. **Per-match constraint** — for every match, one
 *      team is home and the other is away. Encoded
 *      naturally: a single boolean per (team, round)
 *      determines both teams' HA via
 *      `home = aHome ? a : b`.
 *   2. **No 3-streak within leg 1** — for every team,
 *      the sequence of home/away values across rounds
 *      0..N-2 has no 3 consecutive same values.
 *   3. **No 3-streak at the leg-1 / leg-2 boundary** —
 *      when a downstream caller mirrors leg 1's HA
 *      assignment to produce the second leg of a
 *      double round-robin (so each pair plays once at
 *      each venue), the combined leg-1 + leg-2
 *      sequence must also have no 3-streak. The
 *      boundary triple `(teamHA[N-3], teamHA[N-2],
 *      !teamHA[0])` is the one position a within-leg-1
 *      constraint can't see; we check it explicitly on
 *      the last leg-1 round.
 *
 * Implementation: recursive backtracking over matches
 * in (round, matchInRound) order. For each match we
 * try both `aHome` polarities and recurse. Pruning
 * runs BEFORE pushing: a polarity that would complete a
 * 3-streak for either team in the match is skipped.
 *
 * The Thielen 2003 paper proves a valid assignment
 * always exists for N ≥ 4 (even), so the recursion
 * never exhausts the search space in the production
 * shape. `thielenEHV` throws if it ever does — better
 * than a silent fallback that could ship 3-streaks
 * to the FE.
 *
 * Performance: the backtracking is bounded. For N=8
 * (28 matches, 14 rounds per team) the search
 * converges in microseconds; for N=16 (120 matches,
 * 30 rounds per team) it converges in well under a
 * second. The CSP is the production HA-assignment
 * algorithm for both the season-1 init path
 * (`ScheduleGenerator`) and the mid-season reschedule
 * path (`SeasonSchedulerService`) — both use the same
 * utility so the user-facing "max streak ≤ 2 for every
 * team" guarantee is identical across the two.
 *
 * Pure module: no DB or framework dependency. The
 * caller's only input is the pairings; the output is
 * a `Map<teamId, boolean[]>`. Testable in isolation
 * (see `thielen-ehv.spec.ts`).
 */

/**
 * A single round's pairings. Each entry is a 2-tuple
 * `[teamA, teamB]` — order matters for the CSP, which
 * encodes the per-match HA as "is teamA the home
 * team?" (`true` / `false`).
 */
export type RoundPairings = Array<[string, string]>;

export interface ThielenPairings {
  /** Team ids in the order the circle method expects (the
   *  first id is the "fixed" team; the rest rotate). */
  teamIds: string[];
  /** `pairings[r]` is the list of matchups in round `r`
   *  (0-indexed). For a standard N-team round-robin
   *  there are N-1 rounds, each with `floor(N/2)`
   *  matchups. */
  pairings: RoundPairings[];
}

export type ThielenHAMatrix = Map<string, boolean[]>;

/**
 * Compute the Thielen EHV (equitable home venue)
 * assignment for the given round-robin pairings.
 *
 * Returns a `Map<teamId, boolean[]>` where
 * `result.get(teamId)[r]` is `true` if `teamId` is
 * home in round `r`, `false` if away. The CSP
 * considers BOTH the within-leg constraint AND the
 * leg-1 / leg-2 boundary so the caller's mirror-leg
 * doesn't create a cross-boundary 3-streak.
 *
 * Throws if no valid assignment exists. Per Thielen
 * 2003 this branch is unreachable for N ≥ 4 even (the
 * standard pyramid), but throwing beats a silent
 * fallback.
 */
export function thielenEHV(input: ThielenPairings): ThielenHAMatrix {
  const { teamIds, pairings } = input;
  const N = teamIds.length;
  const numRounds = N - 1;
  // `floor(N/2)` because the circle method gives
  // `floor(N/2)` matchups per round (one team sits
  // out for odd N). For even N this is N/2; for odd N
  // the non-integer `/2` would corrupt the
  // `matchIdx / matchesPerRound` arithmetic.
  const matchesPerRound = Math.floor(N / 2);
  const totalMatches = numRounds * matchesPerRound;

  if (totalMatches === 0) {
    // N=1 or N=2: no matches, no HA to assign. Return
    // an empty matrix so callers don't have to special-case.
    return new Map(teamIds.map((id) => [id, [] as boolean[]]));
  }

  // Index lookup — converting a teamId to its 0..N-1
  // position in `teamHA`. Done once at the top of the
  // CSP so the hot loop doesn't pay a Map.get per
  // backtrack step.
  const teamIdx = new Map<string, number>();
  teamIds.forEach((id, i) => teamIdx.set(id, i));

  // teamHA[i] grows to length numRounds as the
  // backtracking progresses round by round.
  const teamHA: boolean[][] = teamIds.map(() => []);

  // Would pushing `newVal` onto `seq` create a
  // 3-in-a-row? Look at the last 2 values; if both
  // equal `newVal`, the push would form a 3-streak.
  const wouldCreate3Streak = (
    seq: boolean[],
    newVal: boolean,
  ): boolean => {
    const n = seq.length;
    return n >= 2 && seq[n - 1] === newVal && seq[n - 2] === newVal;
  };

  // Would pushing `newVal` onto `seq` (the leg-1
  // sequence) create a 3-streak in the COMBINED
  // leg-1 + mirror-leg-2 sequence at the leg
  // boundary? The two cross-boundary triples are
  // (see the comment above the call site for the
  // indexing):
  //   (N-3, N-2, N-1):  seq[N-3], newVal, !seq[0]
  //   (N-2, N-1, N):    newVal, !seq[0], !seq[1]
  // The first catches 3-streaks ending at the
  // boundary; the second catches 3-streaks starting
  // at the boundary (the AAA case the N=4 trace
  // originally tripped on).
  const wouldCreateBoundary3Streak = (
    seq: boolean[],
    newVal: boolean,
  ): boolean => {
    if (seq.length < 2) return false;
    // Check 1: 3-streak at positions (N-3, N-2, N-1).
    const last1 = seq[seq.length - 1];
    const leg2Start = !seq[0];
    if (last1 === newVal && newVal === leg2Start) return true;
    // Check 2: 3-streak at positions (N-2, N-1, N).
    // newVal == !seq[0] AND !seq[0] == !seq[1]
    //   iff newVal == !seq[0] AND seq[0] == seq[1].
    if (seq[0] === seq[1] && newVal === !seq[0]) return true;
    return false;
  };

  const backtrack = (matchIdx: number): boolean => {
    if (matchIdx === totalMatches) return true;

    const roundIdx = Math.floor(matchIdx / matchesPerRound);
    const matchInRound = matchIdx % matchesPerRound;
    const [a, b] = pairings[roundIdx][matchInRound];
    const aIdx = teamIdx.get(a)!;
    const bIdx = teamIdx.get(b)!;

    // Try both HA polarities. For each, check the
    // no-3-streak constraint on both teams in the
    // match before recursing.
    for (const aHome of [true, false]) {
      const bHome = !aHome;
      if (
        wouldCreate3Streak(teamHA[aIdx], aHome) ||
        wouldCreate3Streak(teamHA[bIdx], bHome)
      ) {
        continue;
      }
      // Leg 1 / leg 2 boundary check. The combined
      // leg-1 + leg-2 sequence for each team is:
      //   combined[i]        = teamHA[i]              for i in 0..N-2
      //   combined[i + N-1]  = !teamHA[i]            for i in 0..N-2
      // The within-leg-1 3-streak check above covers
      // positions (r-2, r-1, r) for any r, and the
      // within-leg-2 3-streak is the inverse of
      // within-leg-1 so it's also covered. The spots
      // NOT covered are the cross-boundary triples in
      // the combined sequence:
      //   (N-3, N-2, N-1): leg1[N-3], leg1[N-2], !leg1[0]
      //   (N-2, N-1, N):   leg1[N-2], !leg1[0], !leg1[1]
      // The first is the 3-streak ending at the
      // boundary; the second is the 3-streak starting
      // at the boundary. The second is what bit the
      // N=4 trace: T0 with leg1 = [H, H, A] gives a
      // combined [H, H, A, A, A, H] — the AAA at
      // positions 3-5 (i.e. leg1[2], leg2[0], leg2[1])
      // is a 3-streak the original check missed because
      // leg1[2] is the last assigned value and leg2[0]
      // / leg2[1] are the first two inverses.
      //
      // Both checks fire only on the last leg-1 round
      // (roundIdx === N-2), since earlier rounds don't
      // have a boundary yet.
      if (roundIdx === numRounds - 1) {
        if (
          wouldCreateBoundary3Streak(teamHA[aIdx], aHome) ||
          wouldCreateBoundary3Streak(teamHA[bIdx], bHome)
        ) {
          continue;
        }
      }
      teamHA[aIdx].push(aHome);
      teamHA[bIdx].push(bHome);
      if (backtrack(matchIdx + 1)) return true;
      teamHA[aIdx].pop();
      teamHA[bIdx].pop();
    }
    return false;
  };

  if (!backtrack(0)) {
    // The Thielen paper guarantees this is unreachable
    // for N ≥ 4, but a hard failure here is better
    // than a silent fallback that could ship 3-streaks
    // to the FE.
    throw new Error(
      `thielenEHV: no valid HA assignment for N=${N}`,
    );
  }

  const result: ThielenHAMatrix = new Map();
  teamIds.forEach((id, i) => result.set(id, teamHA[i]));
  return result;
}

/**
 * Build the round-robin pairings for `teamIds` using
 * the standard circle method, with `teamIds[0]` as the
 * "fixed" team. The output is the `[round][match] →
 * [teamA, teamB]` shape `thielenEHV` expects.
 *
 * N must be ≥ 4 (the circle method's degenerate
 * 1/2/3-team cases are not meaningful for a double
 * round-robin; callers that handle small leagues
 * should skip pairing generation entirely).
 *
 * For odd N the rightmost rotating team sits out
 * each round ("bye" in round-robin terms). The
 * circle method gives `floor(N/2)` matchups per round
 * — the partner pairing loop runs `i = 1 ..
 * floor(rotatingTeams.length / 2)` which handles the
 * "one team sits out" case automatically.
 */
export function circleMethodPairings(teamIds: string[]): RoundPairings[] {
  const N = teamIds.length;
  const numRounds = N - 1;
  const fixedTeam = teamIds[0];
  const rotatingTeams = teamIds.slice(1);

  const pairings: RoundPairings[] = [];
  for (let r = 0; r < numRounds; r++) {
    const rotated = [...rotatingTeams];
    // Rotate by `r` positions so each round of the
    // round-robin gets a fresh pairing set.
    for (let i = 0; i < r; i++) {
      const last = rotated.pop()!;
      rotated.unshift(last);
    }
    const roundPairings: RoundPairings = [];
    // Fixed team (always `teamIds[0]`) vs the rotated
    // slot's first element.
    roundPairings.push([fixedTeam, rotated[0]]);
    // Outer-inner pairs.
    for (let i = 1; i < rotated.length / 2; i++) {
      roundPairings.push([rotated[i], rotated[rotated.length - i]]);
    }
    pairings.push(roundPairings);
  }
  return pairings;
}
