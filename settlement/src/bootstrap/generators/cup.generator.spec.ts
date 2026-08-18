import { CupGenerator } from './cup.generator';
import { LOGGER_SERVICE } from '@goalxi/logger';
import {
  CupBracketSlotEntity,
  CupEntity,
  CupEntryEntity,
  CupRoundEntity,
  TeamEntity,
  LeagueEntity,
  type CupStatus,
  type CupRoundKind,
  type CupRoundStatus,
} from '@goalxi/database';

/**
 * Smoke spec for the National Cup bootstrap generator.
 *
 * The calculator (`cup-calculator.ts`) is already pinned by 44
 * cases in `libs/database`. Here we just verify the generator
 * wires the calculator output to the right DB rows — that
 * the round count, entry count and slot count come out as
 * expected for a small 2-tier pyramid.
 */
describe('CupGenerator — bootstrap', () => {
  const mockLogger = {
    info: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    error: jest.fn(),
  };

  /**
   * Build a generator wired to mocked repos. The mocks are
   * hand-rolled (not jest-auto-mocked) so the test reads
   * top-to-bottom — every repo call the generator makes is
   * visible in this file.
   */
  function build() {
    const cupRepo = {
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn((d) => d),
      save: jest.fn(async (d) => ({
        id: 'cup-id',
        ...d,
      })),
    };
    const roundRepo = {
      create: jest.fn((d) => d),
      save: jest.fn(async (rows) =>
        rows.map((r: any, i: number) => ({ id: `round-${i}`, ...r })),
      ),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    const entryRepo = {
      create: jest.fn((d) => d),
      save: jest.fn(async (rows) => rows),
    };
    const slotRepo = {
      create: jest.fn((d) => d),
      save: jest.fn(async (rows) => rows),
    };
    const teamQb = {
      innerJoin: jest.fn().mockReturnThis(),
      innerJoinAndSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      getCount: jest.fn(),
      getMany: jest.fn(),
    };
    const teamRepo = {
      createQueryBuilder: jest.fn(() => teamQb),
    };
    const leagueRepo = {
      find: jest.fn(),
    };
    return {
      gen: new CupGenerator(
        mockLogger as any,
        cupRepo as any,
        roundRepo as any,
        entryRepo as any,
        slotRepo as any,
        teamRepo as any,
        leagueRepo as any,
      ),
      cupRepo,
      roundRepo,
      entryRepo,
      slotRepo,
      teamQb,
      teamRepo,
      leagueRepo,
    };
  }

  beforeEach(() => {
    mockLogger.info.mockClear();
    mockLogger.warn.mockClear();
  });

  /**
   * Build a list of teams for a single tier, with ELOs
   * assigned in the order given. Used to drive `getMany`
   * in the per-tier queries.
   */
  const teamsFor = (tier: number, count: number): TeamEntity[] =>
    Array.from({ length: count }, (_, i) => ({
      id: `t${tier}-${i}`,
      leagueId: `L${tier}`,
      eloRating: 2000 - i * 10, // descending ELO
    } as unknown as TeamEntity));

  function stubPyramid(mocks: ReturnType<typeof build>) {
    // 2 tiers: L1 (16 teams, 1 league) + L2 (8 teams, 1 league).
    // ELOs descend within tier, so seedRank 1 = top of tier.
    mocks.leagueRepo.find.mockResolvedValue([
      { id: 'L1', tier: 1 } as LeagueEntity,
      { id: 'L2', tier: 2 } as LeagueEntity,
    ]);
    // The generator calls createQueryBuilder twice per tier:
    // once for getCount (tier count) and once for getMany (tier teams).
    // We use a queue — first N calls return count, then we return teams.
    // Simpler: have getCount return a number and getMany return teams
    // keyed by the WHERE clause. Since the generator runs the queries
    // in series (count-then-fetch), the test can use a counter.
    let callIndex = 0;
    const countsByTier = new Map<number, number>([
      [1, 16],
      [2, 8],
    ]);
    const teamsByTier = new Map<number, TeamEntity[]>([
      [1, teamsFor(1, 16)],
      [2, teamsFor(2, 8)],
    ]);
    // The query builder captures `tier` in `where`. We snapshot it
    // by intercepting the where() call. This is the brittle bit;
    // see the generator for the actual `where` invocation order.
    let currentTier: number | null = null;
    mocks.teamQb.where.mockImplementation((_clause: any, params: any) => {
      if (params?.tier !== undefined) currentTier = params.tier;
      return mocks.teamQb;
    });
    mocks.teamQb.getCount.mockImplementation(() => {
      const t = currentTier ?? 1;
      return Promise.resolve(countsByTier.get(t) ?? 0);
    });
    mocks.teamQb.getMany.mockImplementation(() => {
      const t = currentTier ?? 1;
      return Promise.resolve(teamsByTier.get(t) ?? []);
    });
  }

  it('is a no-op when a cup for the season already exists', async () => {
    const mocks = build();
    mocks.cupRepo.findOne.mockResolvedValue({
      id: 'existing',
      season: 1,
      type: 'NATIONAL',
    } as CupEntity);

    await mocks.gen.generateCupForSeason(1);

    expect(mocks.cupRepo.save).not.toHaveBeenCalled();
    expect(mocks.roundRepo.save).not.toHaveBeenCalled();
    expect(mocks.entryRepo.save).not.toHaveBeenCalled();
    expect(mocks.slotRepo.save).not.toHaveBeenCalled();
    expect(mockLogger.info).toHaveBeenCalledWith(
      expect.stringContaining('already exists'),
    );
  });

  it('warns and exits when no leagues are in the database', async () => {
    const mocks = build();
    mocks.leagueRepo.find.mockResolvedValue([]);

    await mocks.gen.generateCupForSeason(1);

    expect(mocks.cupRepo.save).not.toHaveBeenCalled();
    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.stringContaining('No leagues found'),
    );
  });

  it('creates cup + rounds + entries + R0 slots for a 2-tier pyramid', async () => {
    const mocks = build();
    stubPyramid(mocks);

    await mocks.gen.generateCupForSeason(1);

    // Cup row
    expect(mocks.cupRepo.save).toHaveBeenCalledTimes(1);
    const cupArg = mocks.cupRepo.create.mock.calls[0][0];
    expect(cupArg).toMatchObject({
      season: 1,
      type: 'NATIONAL',
      name: 'National Cup 1',
      status: 'pending' satisfies CupStatus,
    });

    // Round rows: L1+L2 → 2 tiers → ceil(log2(2))=1 merge round.
    // max(internalRounds) = ceil(log2(16)) = 4 (L1).
    // totalRounds = 4 + 1 = 5. So 5 round rows.
    expect(mocks.roundRepo.save).toHaveBeenCalledTimes(1);
    const rounds = mocks.roundRepo.save.mock.calls[0][0] as any[];
    expect(rounds).toHaveLength(5);
    expect(rounds[0].kind).toBe('qualifying');
    expect(rounds[4].kind).toBe('final');
    expect(rounds[4].roundName).toBe('Final');

    // Entry rows: 16 L1 + 8 L2 = 24 entries
    expect(mocks.entryRepo.save).toHaveBeenCalledTimes(1);
    const entries = mocks.entryRepo.save.mock.calls[0][0] as any[];
    expect(entries).toHaveLength(24);

    // seed ranks should be 1..16 for L1 (top 16 ELOs) and 1..8 for L2
    const l1Entries = entries.filter((e) => e.tier === 1);
    const l2Entries = entries.filter((e) => e.tier === 2);
    expect(l1Entries).toHaveLength(16);
    expect(l2Entries).toHaveLength(8);
    const l1Seeds = l1Entries.map((e) => e.seedRank).sort((a, b) => a - b);
    expect(l1Seeds).toEqual(Array.from({ length: 16 }, (_, i) => i + 1));
    const l2Seeds = l2Entries.map((e) => e.seedRank).sort((a, b) => a - b);
    expect(l2Seeds).toEqual(Array.from({ length: 8 }, (_, i) => i + 1));

    // Entry round: L1 = max(4) - 4 = 0, L2 = max(4) - 3 = 1
    expect(l1Entries[0].entryRound).toBe(0);
    expect(l2Entries[0].entryRound).toBe(1);

    // ELO snapshot
    expect(l1Entries[0].eloSnapshot).toBe(2000); // top ELO
    expect(l1Entries[15].eloSnapshot).toBe(1850); // bottom of L1

    // Round-0 slots: only L1 enters at R0 (L2 enters at R1).
    // 16 L1 teams = 0 byes (even) + 8 matches = 16 slots (2 per match).
    expect(mocks.slotRepo.save).toHaveBeenCalledTimes(1);
    const slots = mocks.slotRepo.save.mock.calls[0][0] as any[];
    expect(slots).toHaveLength(16);
    // Snake pairing: slot 0 is home=seed1, slot 1 is away=seed16
    expect(slots[0].homeTeamId).toBe('t1-0');
    expect(slots[1].awayTeamId).toBe('t1-15');
    // All R0 slots have roundNumber=0 and isBye=false (no byes here)
    for (const s of slots) {
      expect(s.roundNumber).toBe(0);
      expect(s.isBye).toBe(false);
    }
  });

  it('skips tiers with 0 teams (no entry rows, no orphan bracket slots)', async () => {
    const mocks = build();
    // Only L1 has teams; L2 league exists but has no teams.
    mocks.leagueRepo.find.mockResolvedValue([
      { id: 'L1', tier: 1 } as LeagueEntity,
      { id: 'L2-empty', tier: 2 } as LeagueEntity,
    ]);
    let currentTier: number | null = null;
    mocks.teamQb.where.mockImplementation((_clause: any, params: any) => {
      if (params?.tier !== undefined) currentTier = params.tier;
      return mocks.teamQb;
    });
    mocks.teamQb.getCount.mockImplementation(() => {
      return Promise.resolve(currentTier === 1 ? 8 : 0);
    });
    mocks.teamQb.getMany.mockImplementation(() => {
      return Promise.resolve(currentTier === 1 ? teamsFor(1, 8) : []);
    });

    await mocks.gen.generateCupForSeason(1);

    // Only L1 entries were created.
    const entries = mocks.entryRepo.save.mock.calls[0][0] as any[];
    expect(entries).toHaveLength(8);
    expect(entries.every((e) => e.tier === 1)).toBe(true);
  });

  it('handles odd-team L4 case: top seed gets a bye in R0', async () => {
    const mocks = build();
    // 1-tier test: only L1 with 5 teams (odd). Snake pairing gives 1 bye.
    mocks.leagueRepo.find.mockResolvedValue([
      { id: 'L1', tier: 1 } as LeagueEntity,
    ]);
    let currentTier: number | null = null;
    mocks.teamQb.where.mockImplementation((_clause: any, params: any) => {
      if (params?.tier !== undefined) currentTier = params.tier;
      return mocks.teamQb;
    });
    mocks.teamQb.getCount.mockResolvedValue(5);
    mocks.teamQb.getMany.mockResolvedValue(teamsFor(1, 5));

    await mocks.gen.generateCupForSeason(1);

    const slots = mocks.slotRepo.save.mock.calls[0][0] as any[];
    // 1 bye slot (top seed) + 2 matches * 2 slots = 1 + 4 = 5 slots
    expect(slots).toHaveLength(5);
    const byes = slots.filter((s) => s.isBye);
    expect(byes).toHaveLength(1);
    expect(byes[0].homeTeamId).toBe('t1-0'); // top seed gets the bye
    expect(byes[0].awayTeamId).toBeNull();
    expect(byes[0].winnerTeamId).toBe('t1-0'); // bye resolves immediately
  });

  it('sets round.scheduledAt when initDate is provided (anchored to GAME_SETTINGS.MATCH_KICKOFF_HOUR_UTC)', async () => {
    const mocks = build();
    stubPyramid(mocks);
    // Use a known date — Wednesday 2026-09-09. Cup rounds anchor
    // 1 week, 2 weeks, etc. AFTER this date, all at 6:00 UTC.
    const initDate = new Date('2026-09-09T00:00:00Z');

    await mocks.gen.generateCupForSeason(1, initDate);

    const rounds = mocks.roundRepo.save.mock.calls[0][0] as any[];
    // 2-tier cup (L1+L2) → 5 rounds (R0..R4), R4 = Final.
    // R0 → initDate + 7 days = 2026-09-16 06:00 UTC
    expect(new Date(rounds[0].scheduledAt).toISOString()).toBe(
      '2026-09-16T06:00:00.000Z',
    );
    // R3 → initDate + 4*7 days = 2026-10-07 06:00 UTC
    expect(new Date(rounds[3].scheduledAt).toISOString()).toBe(
      '2026-10-07T06:00:00.000Z',
    );
    // Last round (R4 = Final) → initDate + 5*7 = 2026-10-14
    expect(new Date(rounds[rounds.length - 1].scheduledAt).toISOString()).toBe(
      '2026-10-14T06:00:00.000Z',
    );
  });

  it('leaves round.scheduledAt as null when initDate is omitted (CupScheduler back-fills on first tick)', async () => {
    const mocks = build();
    stubPyramid(mocks);

    await mocks.gen.generateCupForSeason(1);

    const rounds = mocks.roundRepo.save.mock.calls[0][0] as any[];
    for (const r of rounds) {
      expect(r.scheduledAt).toBeNull();
    }
  });
});
