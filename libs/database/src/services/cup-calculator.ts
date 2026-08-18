/**
 * Pure functions for deriving a cup's bracket structure from the
 * participating tiers. No DB, no NestJS, no side effects — everything
 * here can be unit-tested in isolation.
 *
 * ## Mental model
 *
 * A multi-tier cup (e.g. GoalXI National Cup with L1-L4) is a
 * single-elimination bracket where:
 *
 *   - Each tier's teams enter the bracket at a specific round. The
 *     tier with the MOST teams dictates the bracket depth.
 *   - All tier-winners emerge at the same round (one round before
 *     the merge rounds).
 *   - The merge rounds reduce the tier-winners to 1 champion. With
 *     T tiers, the merge is `ceil(log2(T))` rounds.
 *
 * ## Why this shape?
 *
 *   - Top-tier teams (L1) only play a few rounds; bottom-tier teams
 *     (L4) play the most. This mirrors the FA Cup "qualifying" model
 *     where amateur sides grind through early rounds and Premier
 *     League teams enter at R3.
 *   - `ceil(log2(T))` merge rounds keeps the final a single match
 *     (2 teams), regardless of how many tiers exist. Adding L5/L6
 *     later only widens the qualifying rounds, not the merge.
 *
 * ## Bracket halving
 *
 * Unlike "round 0 only" byes (which dump 688 byes into a 1360-team
 * Pre-Qualifying), we let **each round** halve naturally:
 *
 *   totalInRound(r) = newEntries(r) + advancing(r-1)
 *   byes(r)         = totalInRound(r) % 2            (0 or 1)
 *   matches(r)      = (totalInRound(r) - byes(r)) / 2
 *   advancing(r)    = matches(r) + byes(r)
 *
 * When `totalInRound` is even (the L1-L4 case), `byes = 0` every
 * round and the bracket halves cleanly. When odd (e.g. merging 5
 * tier-winners with 1 bye), the top seed gets the bye and plays
 * in the round AFTER the current one.
 *
 * ## Formulas
 *
 *   internalRounds(tier)    = ceil(log2(tier.teamCount))
 *   entryRound(tier)        = max(internalRounds) - internalRounds(tier)
 *   totalRounds             = max(internalRounds) + ceil(log2(numTiers))
 *
 * Worked example for the L1-L4 National Cup (current MVP):
 *
 *   tier | teamCount | internalRounds | entryRound
 *   -----+-----------+----------------+-----------
 *   L1   |        16 |              4 |          6
 *   L2   |        64 |              6 |          4
 *   L3   |       256 |              8 |          2
 *   L4   |      1024 |             10 |          0
 *
 *   totalRounds = 10 + ceil(log2(4)) = 10 + 2 = 12
 *
 *   Bracket halving (all even, no byes):
 *     R0: 1024 → 512 matches → 512 advance
 *     R1:  512 → 256          → 256 advance
 *     R2:  256 + 256 L3 = 512 → 256          → 256 advance
 *     R3:  256 → 128          → 128 advance
 *     R4:  128 +  64 L2 = 192 →  96          →  96 advance
 *     R5:   96 →  48          →  48 advance
 *     R6:   48 +  16 L1 =  64 →  32          →  32 advance
 *     R7:   32 →  16          →  16 advance
 *     R8:   16 →   8          →   8 advance
 *     R9:    8 →   4          →   4 advance
 *     R10:   4 →   2          →   2 advance
 *     R11:   2 →   1          →   1 advance (champion)
 *
 * Worked example for an extended L1-L6 pyramid (future-proofing):
 *
 *   tier | teamCount  | internalRounds | entryRound
 *   -----+------------+----------------+-----------
 *   L1   |        16 |              4 |         10
 *   L2   |        64 |              6 |          8
 *   L3   |       256 |              8 |          6
 *   L4   |      1024 |             10 |          4
 *   L5   |      4096 |             12 |          2
 *   L6   |     16384 |             14 |          0
 *
 *   totalRounds = 14 + ceil(log2(6)) = 14 + 3 = 17
 */

export interface CupTierInput {
  /** Tier number — 1 = top, 2 = next, etc. Lower = stronger. */
  tier: number;
  /** Number of teams this tier contributes to the cup. */
  teamCount: number;
}

export interface CupTierEntry extends CupTierInput {
  /** ceil(log2(teamCount)) — number of internal rounds a tier needs to find 1 winner. */
  internalRounds: number;
  /** Round at which the tier joins the bracket. 0 = first round played. */
  entryRound: number;
}

export interface CupStructure {
  /** 0-indexed total rounds. The final round is `totalRounds - 1`. */
  totalRounds: number;
  /** Per-tier breakdown. */
  entries: CupTierEntry[];
}

export interface CupRoundInfo {
  /** 0-indexed round number. */
  round: number;
  /** Teams that enter the cup for the first time in this round. */
  newEntries: number;
  /** Total teams playing in this round (newEntries + winners from previous). */
  totalInRound: number;
  /** Teams that auto-advance (0 if even, 1 if odd — top seed). */
  byes: number;
  /** Matches played in this round. */
  matches: number;
  /** Teams that advance to the next round (matches + byes). */
  advancing: number;
}

/**
 * Compute the cup's round structure from the list of participating
 * tiers. Throws on empty input or non-positive team counts.
 *
 * Order of the input does not matter — the function sorts by tier
 * internally so the result is deterministic regardless of caller
 * order.
 */
export function calculateEntryRounds(tiers: CupTierInput[]): CupStructure {
  if (tiers.length === 0) {
    throw new Error('calculateEntryRounds: at least one tier required');
  }
  for (const t of tiers) {
    if (!Number.isFinite(t.teamCount) || t.teamCount < 1) {
      throw new Error(
        `calculateEntryRounds: tier ${t.tier} has invalid teamCount ${t.teamCount}`,
      );
    }
  }

  const withInternal = tiers.map((t) => ({
    ...t,
    internalRounds: Math.ceil(Math.log2(t.teamCount)),
  }));

  const maxInternalRounds = Math.max(...withInternal.map((t) => t.internalRounds));
  const mergeRounds = Math.ceil(Math.log2(withInternal.length));
  const totalRounds = maxInternalRounds + mergeRounds;

  // Sort entries by tier ascending so the FE can render the entry
  // ladder (L1 → L2 → L3 → L4) in a stable order.
  const entries = withInternal
    .map((t) => ({
      ...t,
      entryRound: maxInternalRounds - t.internalRounds,
    }))
    .sort((a, b) => a.tier - b.tier);

  return { totalRounds, entries };
}

/**
 * Simulate the full bracket progression, round by round, until
 * exactly 1 team remains. Returns an array of `CupRoundInfo` in
 * round order.
 *
 * This is the authoritative function for "how many matches happen
 * in round N" — both `computeRoundSlotCount` and `computeByeCount`
 * read from this cached result. Iterating once is faster than
 * recomputing per call, and prevents the "bouncing byes" failure
 * mode where power-of-2 bumping at every round creates a feedback
 * loop (see the docstring of this file for the rejected approach).
 */
export function simulateBracket(structure: CupStructure): CupRoundInfo[] {
  if (structure.entries.length === 0) {
    throw new Error('simulateBracket: no entries in structure');
  }

  const result: CupRoundInfo[] = [];
  for (let r = 0; r < structure.totalRounds; r++) {
    const newEntries = structure.entries
      .filter((e) => e.entryRound === r)
      .reduce((sum, e) => sum + e.teamCount, 0);

    const prevAdvancing = r === 0 ? 0 : result[r - 1].advancing;
    const totalInRound = newEntries + prevAdvancing;

    // teamCount < 2 makes no sense (no match possible); clamp to
    // 0 to surface the bug in the entry formula rather than
    // silently producing negative byes.
    if (totalInRound < 0) {
      throw new Error(
        `simulateBracket: round ${r} has negative totalInRound ${totalInRound}`,
      );
    }

    const byes = totalInRound % 2;
    const matches = (totalInRound - byes) / 2;
    const advancing = matches + byes;

    result.push({ round: r, newEntries, totalInRound, byes, matches, advancing });
  }

  // Sanity: last round must produce exactly 1 champion.
  if (result.length > 0 && result[result.length - 1].advancing !== 1) {
    throw new Error(
      `simulateBracket: last round (R${result.length - 1}) advances ` +
        `${result[result.length - 1].advancing} teams, expected 1. ` +
        `Check the entry-round formula in calculateEntryRounds.`,
    );
  }

  return result;
}

/**
 * Number of teams playing in `round` (new entries + winners from
 * the previous round). For rounds before the deepest tier's entry
 * round the result is 0.
 */
export function computeRoundSlotCount(
  round: number,
  structure: CupStructure,
): number {
  if (round < 0 || round >= structure.totalRounds) {
    throw new Error(
      `computeRoundSlotCount: round ${round} out of range [0, ${structure.totalRounds})`,
    );
  }
  const progression = simulateBracket(structure);
  return progression[round].totalInRound;
}

/**
 * Detailed round info (byes, matches, advancing). For rounds with
 * an even team count, byes = 0; for odd team counts, byes = 1 (the
 * top seed auto-advances).
 */
export function computeByeCount(
  round: number,
  structure: CupStructure,
): { byes: number; matches: number; totalInRound: number; advancing: number } {
  if (round < 0 || round >= structure.totalRounds) {
    throw new Error(
      `computeByeCount: round ${round} out of range [0, ${structure.totalRounds})`,
    );
  }
  const progression = simulateBracket(structure);
  const info = progression[round];
  return {
    byes: info.byes,
    matches: info.matches,
    totalInRound: info.totalInRound,
    advancing: info.advancing,
  };
}

/**
 * A team-like record for `pairTeamsSeeded`. The only field the
 * function needs is `seedRank` (1 = top seed). `elo` is used as a
 * tiebreaker. The `id` is returned in the pair output so the
 * generator can persist it without needing a `TeamEntity` shape.
 */
export interface SeededTeam {
  id: string;
  seedRank: number;
  elo: number;
}

export interface CupPair<T extends SeededTeam> {
  homeTeam: T;
  awayTeam: T;
}

export interface CupPairingResult<T extends SeededTeam> {
  /** Matches to be played. Length = totalInRound / 2 (rounded down). */
  pairs: CupPair<T>[];
  /** Teams that auto-advance (1 if totalInRound is odd, else 0). */
  byes: T[];
}

/**
 * Pair teams in a round using the FA Cup "snake" seeding:
 * sort by seed, give the top seed a bye if count is odd, then pair
 * the i-th best seed with the (n-i)-th best seed. The lower seed
 * (better) is always the home team.
 *
 * The snake pairing means the strongest team in the bottom half
 * meets the strongest team in the top half — strong teams only meet
 * in the final, weak teams only meet in round 1. Same logic the
 * FA Cup and NCAA March Madness use.
 */
export function pairTeamsSeeded<T extends SeededTeam>(teams: T[]): CupPairingResult<T> {
  if (teams.length === 0) {
    return { pairs: [], byes: [] };
  }

  // Sort: lower seedRank first, higher ELO as tiebreaker. Explicit
  // comparator to be safe across Node versions.
  const sorted = [...teams].sort((a, b) => {
    if (a.seedRank !== b.seedRank) return a.seedRank - b.seedRank;
    return b.elo - a.elo;
  });

  const byes: T[] = [];
  if (sorted.length % 2 === 1) {
    byes.push(sorted.shift()!);
  }

  const pairs: CupPair<T>[] = [];
  const half = sorted.length / 2;
  for (let i = 0; i < half; i++) {
    pairs.push({
      homeTeam: sorted[i],
      awayTeam: sorted[sorted.length - 1 - i],
    });
  }
  return { pairs, byes };
}

/**
 * Compute the next power of 2 ≥ n. Used by other modules that
 * need a clean bracket size (e.g. UI rendering of "next power of
 * 2 slots in this round"). The bracket logic itself does NOT use
 * this — see the docstring on `simulateBracket`.
 */
export function nextPowerOfTwo(n: number): number {
  if (n <= 1) return 1;
  return Math.pow(2, Math.ceil(Math.log2(n)));
}
