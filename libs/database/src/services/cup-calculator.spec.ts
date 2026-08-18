import {
  calculateEntryRounds,
  computeByeCount,
  computeRoundSlotCount,
  nextPowerOfTwo,
  pairTeamsSeeded,
  simulateBracket,
  type SeededTeam,
} from './cup-calculator';

/**
 * Spec for the cup-structure pure functions. The fixtures
 * pin the L1-L4 MVP and the L1-L6 future-proofing numbers
 * that drive the GoalXI National Cup.
 *
 * If you change a number below, you're either:
 *   (a) widening the pyramid (adding L5/L6), or
 *   (b) changing the formula — which needs a spec-level
 *       decision and a docstring update in cup-calculator.ts.
 */
describe('cup-calculator', () => {
  describe('calculateEntryRounds — L1-L4 MVP', () => {
    const tiers = [
      { tier: 1, teamCount: 16 },
      { tier: 2, teamCount: 64 },
      { tier: 3, teamCount: 256 },
      { tier: 4, teamCount: 1024 },
    ];

    it('returns 12 total rounds (10 internal + 2 merge)', () => {
      const result = calculateEntryRounds(tiers);
      expect(result.totalRounds).toBe(12);
    });

    it('places L1 entry at round 6 (5 internal + 1 merge gap to final)', () => {
      // L1 internal = 4 rounds (16 teams). L4 internal = 10 rounds.
      // entryRound = 10 - 4 = 6. L1 plays 12 - 6 = 6 matches.
      const result = calculateEntryRounds(tiers);
      const l1 = result.entries.find((e) => e.tier === 1)!;
      expect(l1.entryRound).toBe(6);
      expect(l1.internalRounds).toBe(4);
    });

    it('places L2 entry at round 4, L3 at round 2, L4 at round 0', () => {
      const result = calculateEntryRounds(tiers);
      const byTier = Object.fromEntries(
        result.entries.map((e) => [e.tier, e.entryRound]),
      );
      expect(byTier).toEqual({ 1: 6, 2: 4, 3: 2, 4: 0 });
    });

    it('sorts entries by tier ascending in the output', () => {
      // Caller order shouldn't matter — input is intentionally
      // shuffled in the fixture.
      const shuffled = [
        { tier: 3, teamCount: 256 },
        { tier: 1, teamCount: 16 },
        { tier: 4, teamCount: 1024 },
        { tier: 2, teamCount: 64 },
      ];
      const result = calculateEntryRounds(shuffled);
      expect(result.entries.map((e) => e.tier)).toEqual([1, 2, 3, 4]);
    });
  });

  describe('calculateEntryRounds — L1-L6 future-proofing', () => {
    const tiers = [
      { tier: 1, teamCount: 16 },
      { tier: 2, teamCount: 64 },
      { tier: 3, teamCount: 256 },
      { tier: 4, teamCount: 1024 },
      { tier: 5, teamCount: 4096 },
      { tier: 6, teamCount: 16384 },
    ];

    it('returns 17 total rounds (14 internal + 3 merge for 6 tiers)', () => {
      const result = calculateEntryRounds(tiers);
      expect(result.totalRounds).toBe(17);
    });

    it('places L1 entry at round 10, L6 entry at round 0', () => {
      // L6 internal = 14 (16384 = 2^14). entryRound = 14 - internalRounds.
      const result = calculateEntryRounds(tiers);
      const byTier = Object.fromEntries(
        result.entries.map((e) => [e.tier, e.entryRound]),
      );
      expect(byTier).toEqual({ 1: 10, 2: 8, 3: 6, 4: 4, 5: 2, 6: 0 });
    });
  });

  describe('calculateEntryRounds — error handling', () => {
    it('throws on empty tier list', () => {
      expect(() => calculateEntryRounds([])).toThrow(
        /at least one tier/,
      );
    });

    it('throws on tier with zero or negative teamCount', () => {
      expect(() =>
        calculateEntryRounds([{ tier: 1, teamCount: 0 }]),
      ).toThrow(/invalid teamCount/);
      expect(() =>
        calculateEntryRounds([{ tier: 1, teamCount: -5 }]),
      ).toThrow(/invalid teamCount/);
    });
  });

  describe('computeRoundSlotCount / computeByeCount — L1-L4 MVP', () => {
    const tiers = [
      { tier: 1, teamCount: 16 },
      { tier: 2, teamCount: 64 },
      { tier: 3, teamCount: 256 },
      { tier: 4, teamCount: 1024 },
    ];
    const structure = calculateEntryRounds(tiers);

    it('round 0: 1024 L4 teams, 0 byes, 512 matches', () => {
      const r = computeByeCount(0, structure);
      expect(r.totalInRound).toBe(1024);
      expect(r.byes).toBe(0);
      expect(r.matches).toBe(512);
      expect(r.advancing).toBe(512);
    });

    it('round 1: 512 L4 winners, 0 byes, 256 matches', () => {
      const r = computeByeCount(1, structure);
      expect(r.totalInRound).toBe(512);
      expect(r.byes).toBe(0);
      expect(r.matches).toBe(256);
    });

    it('round 2: 256 L4 winners + 256 L3 entries = 512, 0 byes, 256 matches', () => {
      const r = computeByeCount(2, structure);
      expect(r.totalInRound).toBe(512);
      expect(r.byes).toBe(0);
      expect(r.matches).toBe(256);
    });

    it('round 3: 256 winners, 0 byes, 128 matches', () => {
      const r = computeByeCount(3, structure);
      expect(r.totalInRound).toBe(256);
      expect(r.byes).toBe(0);
      expect(r.matches).toBe(128);
    });

    it('round 4: 128 L4/L3 winners + 64 L2 entries = 192, 0 byes, 96 matches', () => {
      // The bracket-halves approach: 192/2 = 96 matches, 0 byes
      // (192 is even). The previous "bump to next power of 2" approach
      // (rejected) would have created 64 byes here and bouncing total.
      const r = computeByeCount(4, structure);
      expect(r.totalInRound).toBe(192);
      expect(r.byes).toBe(0);
      expect(r.matches).toBe(96);
      expect(r.advancing).toBe(96);
    });

    it('round 5: 96 winners, 0 byes, 48 matches', () => {
      const r = computeByeCount(5, structure);
      expect(r.totalInRound).toBe(96);
      expect(r.byes).toBe(0);
      expect(r.matches).toBe(48);
    });

    it('round 6: 48 winners + 16 L1 entries = 64, 0 byes, 32 matches', () => {
      const r = computeByeCount(6, structure);
      expect(r.totalInRound).toBe(64);
      expect(r.byes).toBe(0);
      expect(r.matches).toBe(32);
    });

    it('round 7: 32 winners, 0 byes, 16 matches', () => {
      const r = computeByeCount(7, structure);
      expect(r.totalInRound).toBe(32);
      expect(r.byes).toBe(0);
      expect(r.matches).toBe(16);
    });

    it('round 8: 16 winners, 0 byes, 8 matches (Last 16)', () => {
      const r = computeByeCount(8, structure);
      expect(r.totalInRound).toBe(16);
      expect(r.byes).toBe(0);
      expect(r.matches).toBe(8);
    });

    it('round 9: 8 winners, 0 byes, 4 matches (QF)', () => {
      const r = computeByeCount(9, structure);
      expect(r.totalInRound).toBe(8);
      expect(r.byes).toBe(0);
      expect(r.matches).toBe(4);
    });

    it('round 10: 4 tier-winners, 0 byes, 2 matches (SF)', () => {
      const r = computeByeCount(10, structure);
      expect(r.totalInRound).toBe(4);
      expect(r.byes).toBe(0);
      expect(r.matches).toBe(2);
    });

    it('round 11: 2 finalists, 0 byes, 1 match (Final)', () => {
      const r = computeByeCount(11, structure);
      expect(r.totalInRound).toBe(2);
      expect(r.byes).toBe(0);
      expect(r.matches).toBe(1);
      expect(r.advancing).toBe(1);
    });

    it('computeRoundSlotCount agrees with totalInRound on every round', () => {
      for (let r = 0; r < structure.totalRounds; r++) {
        const slotCount = computeRoundSlotCount(r, structure);
        const bye = computeByeCount(r, structure);
        expect(slotCount).toBe(bye.totalInRound);
      }
    });

    it('throws on out-of-range round', () => {
      expect(() => computeRoundSlotCount(-1, structure)).toThrow(
        /out of range/,
      );
      expect(() =>
        computeRoundSlotCount(structure.totalRounds, structure),
      ).toThrow(/out of range/);
    });
  });

  describe('nextPowerOfTwo', () => {
    it.each([
      [1, 1],
      [2, 2],
      [3, 4],
      [4, 4],
      [5, 8],
      [8, 8],
      [9, 16],
      [1023, 1024],
      [1024, 1024],
      [1025, 2048],
    ])('nextPowerOfTwo(%i) === %i', (n, expected) => {
      expect(nextPowerOfTwo(n)).toBe(expected);
    });

    it('clamps 0 and negative to 1', () => {
      expect(nextPowerOfTwo(0)).toBe(1);
      expect(nextPowerOfTwo(-5)).toBe(1);
    });
  });

  describe('simulateBracket — L1-L4 progression', () => {
    const tiers = [
      { tier: 1, teamCount: 16 },
      { tier: 2, teamCount: 64 },
      { tier: 3, teamCount: 256 },
      { tier: 4, teamCount: 1024 },
    ];
    const structure = calculateEntryRounds(tiers);

    it('returns 12 rounds ending in 1 champion', () => {
      const progression = simulateBracket(structure);
      expect(progression).toHaveLength(12);
      expect(progression[11].advancing).toBe(1);
    });

    it('halves cleanly with no byes for L1-L4 (all totals even)', () => {
      const progression = simulateBracket(structure);
      for (const r of progression) {
        expect(r.byes).toBe(0);
      }
    });

    it('marks new entries at the correct rounds (L4=0, L3=2, L2=4, L1=6)', () => {
      const progression = simulateBracket(structure);
      expect(progression[0].newEntries).toBe(1024);
      expect(progression[1].newEntries).toBe(0);
      expect(progression[2].newEntries).toBe(256);
      expect(progression[3].newEntries).toBe(0);
      expect(progression[4].newEntries).toBe(64);
      expect(progression[5].newEntries).toBe(0);
      expect(progression[6].newEntries).toBe(16);
      for (let r = 7; r < 12; r++) {
        expect(progression[r].newEntries).toBe(0);
      }
    });
  });

  describe('simulateBracket — odd-team byes (5-tier hypothetical)', () => {
    // 5 tiers with odd team counts force byes somewhere. Use a
    // tiny pyramid to force odd totals.
    const tiers = [
      { tier: 1, teamCount: 3 },  // 3 L1 teams → odd
      { tier: 2, teamCount: 5 },  // 5 L2 → odd
      { tier: 3, teamCount: 5 },  // 5 L3 → odd
    ];
    const structure = calculateEntryRounds(tiers);

    it('produces 1 bye in a round where the total is odd', () => {
      // Trace: internalRounds = [2, 3, 3], max = 3, total = 3 + 2 = 5
      // entries by tier: L1 = 3 - 2 = 1, L2 = 3 - 3 = 0, L3 = 3 - 3 = 0
      // Wait, sorted by tier so L1 gets entryRound = 1, L2 = 0, L3 = 0.
      // Hmm: max internal = 3. L1 internal = ceil(log2(3)) = 2. entry = 1.
      // L2 internal = 3, entry = 0. L3 internal = 3, entry = 0.
      // R0: 5 L2 + 5 L3 = 10 (even, 0 byes, 5 matches, 5 advance).
      // R1: 5 advance + 3 L1 = 8 (even, 0 byes, 4 matches, 4 advance).
      // R2: 4 (2 matches, 0 byes, 2 advance).
      // R3: 2 (1 match, 0 byes, 1 advance).
      // R4: 1 (0 matches + 1 bye, 1 advance).
      // Hmm need 5 rounds, but formula said totalRounds = 5.
      // 1 bye at the final round (1 team left, 1 bye to make it 2).
      const progression = simulateBracket(structure);
      const finalRound = progression[progression.length - 1];
      expect(finalRound.totalInRound).toBe(1);
      expect(finalRound.byes).toBe(1);
      expect(finalRound.matches).toBe(0);
      expect(finalRound.advancing).toBe(1);
    });
  });

  describe('pairTeamsSeeded', () => {
    /**
     * Build a team with seed N and ELO derived from seed (so tests
     * are deterministic — ELO would normally be free, but pinning
     * it makes assertions on `homeTeam`/`awayTeam` obvious).
     */
    const team = (seedRank: number, id = `t${seedRank}`): SeededTeam => ({
      id,
      seedRank,
      elo: 2000 - seedRank,
    });

    it('returns no pairs and no byes on empty input', () => {
      const r = pairTeamsSeeded<SeededTeam>([]);
      expect(r.pairs).toEqual([]);
      expect(r.byes).toEqual([]);
    });

    it('gives a single team a bye (no pair)', () => {
      const r = pairTeamsSeeded([team(1)]);
      expect(r.pairs).toEqual([]);
      expect(r.byes.map((t) => t.id)).toEqual(['t1']);
    });

    it('pairs two teams: 1 vs 2, lower seed is home', () => {
      const r = pairTeamsSeeded([team(1), team(2)]);
      expect(r.pairs).toEqual([
        { homeTeam: expect.objectContaining({ id: 't1' }), awayTeam: expect.objectContaining({ id: 't2' }) },
      ]);
      expect(r.byes).toEqual([]);
    });

    it('pairs four teams as (1 vs 4, 2 vs 3) — snake seeding', () => {
      const r = pairTeamsSeeded([team(1), team(2), team(3), team(4)]);
      expect(r.pairs).toHaveLength(2);
      expect(r.pairs[0].homeTeam.seedRank).toBe(1);
      expect(r.pairs[0].awayTeam.seedRank).toBe(4);
      expect(r.pairs[1].homeTeam.seedRank).toBe(2);
      expect(r.pairs[1].awayTeam.seedRank).toBe(3);
    });

    it('handles odd count: top seed gets a bye, rest snake-paired', () => {
      const r = pairTeamsSeeded([team(1), team(2), team(3), team(4), team(5)]);
      expect(r.byes.map((t) => t.seedRank)).toEqual([1]);
      // After bye removal, sorted is [2,3,4,5] → pair (2 vs 5, 3 vs 4)
      expect(r.pairs).toHaveLength(2);
      expect(r.pairs[0].homeTeam.seedRank).toBe(2);
      expect(r.pairs[0].awayTeam.seedRank).toBe(5);
      expect(r.pairs[1].homeTeam.seedRank).toBe(3);
      expect(r.pairs[1].awayTeam.seedRank).toBe(4);
    });

    it('falls back to ELO when seedRanks tie', () => {
      // Two #1 seeds (e.g. two co-champions joining via different
      // routes) — the higher-ELO team wins the tiebreak.
      const a: SeededTeam = { id: 'a', seedRank: 1, elo: 1500 };
      const b: SeededTeam = { id: 'b', seedRank: 1, elo: 1700 };
      const r = pairTeamsSeeded([a, b]);
      // Higher ELO (b) should sort first → home team.
      expect(r.pairs[0].homeTeam.id).toBe('b');
      expect(r.pairs[0].awayTeam.id).toBe('a');
    });

    it('handles the L1 entry scenario: 16 teams, 0 byes, 8 pairs, no seedRank 0 entries', () => {
      const teams = Array.from({ length: 16 }, (_, i) => team(i + 1));
      const r = pairTeamsSeeded(teams);
      expect(r.pairs).toHaveLength(8);
      expect(r.byes).toEqual([]);
      // Snake: pair[0] = (1 vs 16), pair[7] = (8 vs 9)
      expect(r.pairs[0].homeTeam.seedRank).toBe(1);
      expect(r.pairs[0].awayTeam.seedRank).toBe(16);
      expect(r.pairs[7].homeTeam.seedRank).toBe(8);
      expect(r.pairs[7].awayTeam.seedRank).toBe(9);
    });
  });
});
