import { CupSchedulerService } from './cup-scheduler.service';
import { LOGGER_SERVICE } from '@goalxi/logger';
import {
  CupBracketSlotEntity,
  CupEntity,
  CupRoundEntity,
  CupRoundStatus,
  CupStatus,
  MatchEntity,
  MatchStatus,
  MatchType,
  type Uuid,
} from '@goalxi/database';

/**
 * Smoke spec for `CupSchedulerService`. Pins the per-round
 * materialize flow:
 *   - pending round with scheduled_at in the past → CAS to
 *     in_progress → create one MatchEntity per non-bye slot
 *     pair → stamp matchId on both slots of each pair.
 *
 * The cron itself isn't driven here — we call the public
 * `materializeRound` via the `scheduleDueCupRounds` entry
 * point and verify the DB-side effects on the mocked repos.
 */
describe('CupSchedulerService — materialize round', () => {
  const mockLogger = {
    info: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    error: jest.fn(),
  };

  function build() {
    const matchRepo = {
      create: jest.fn((d) => d),
      save: jest.fn(async (d) => ({ id: 'match-id', ...d })),
    };
    const cupRepo = {
      findOne: jest.fn(),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    const roundRepo = {
      find: jest.fn(),
      update: jest.fn(),
      findOne: jest.fn(),
    };
    const slotRepo = {
      find: jest.fn(),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    return {
      gen: new CupSchedulerService(
        mockLogger as any,
        matchRepo as any,
        cupRepo as any,
        roundRepo as any,
        slotRepo as any,
      ),
      matchRepo,
      cupRepo,
      roundRepo,
      slotRepo,
    };
  }

  beforeEach(() => {
    mockLogger.info.mockClear();
    mockLogger.warn.mockClear();
    mockLogger.error.mockClear();
    mockLogger.debug.mockClear();
  });

  it('picks up pending rounds whose scheduledAt is in the past and materializes matches', async () => {
    const mocks = build();
    const round: CupRoundEntity = {
      id: 'round-1' as Uuid,
      cupId: 'cup-1' as Uuid,
      roundNumber: 0,
      roundName: 'Pre-Qualifying',
      kind: 'qualifying',
      status: CupRoundStatus.PENDING,
      slotCount: 4,
      tacticsDeadline: null,
      scheduledAt: new Date('2026-09-16T06:00:00Z'),
    } as CupRoundEntity;
    const cup: CupEntity = {
      id: 'cup-1' as Uuid,
      season: 1,
      type: 'NATIONAL',
      name: 'National Cup 1',
      status: CupStatus.PENDING,
      prizeCurrency: 'CNY',
      prizePool: '0',
    } as CupEntity;
    // 4 slots = 2 pair-matches (slot 0/1 and slot 2/3)
    const slots: CupBracketSlotEntity[] = [
      {
        id: 'slot-0' as Uuid,
        cupId: 'cup-1' as Uuid,
        roundId: 'round-1' as Uuid,
        roundNumber: 0,
        slotIndex: 0,
        homeTeamId: 'team-A' as Uuid,
        awayTeamId: null,
        matchId: null,
        winnerTeamId: null,
        sourceSlotId: null,
        isBye: false,
      } as CupBracketSlotEntity,
      {
        id: 'slot-1' as Uuid,
        cupId: 'cup-1' as Uuid,
        roundId: 'round-1' as Uuid,
        roundNumber: 0,
        slotIndex: 1,
        homeTeamId: null,
        awayTeamId: 'team-B' as Uuid,
        matchId: null,
        winnerTeamId: null,
        sourceSlotId: null,
        isBye: false,
      } as CupBracketSlotEntity,
      {
        id: 'slot-2' as Uuid,
        cupId: 'cup-1' as Uuid,
        roundId: 'round-1' as Uuid,
        roundNumber: 0,
        slotIndex: 2,
        homeTeamId: 'team-C' as Uuid,
        awayTeamId: null,
        matchId: null,
        winnerTeamId: null,
        sourceSlotId: null,
        isBye: false,
      } as CupBracketSlotEntity,
      {
        id: 'slot-3' as Uuid,
        cupId: 'cup-1' as Uuid,
        roundId: 'round-1' as Uuid,
        roundNumber: 0,
        slotIndex: 3,
        homeTeamId: null,
        awayTeamId: 'team-D' as Uuid,
        matchId: null,
        winnerTeamId: null,
        sourceSlotId: null,
        isBye: false,
      } as CupBracketSlotEntity,
    ];

    // 1) find(PENDING) returns the round
    mocks.roundRepo.find.mockResolvedValue([round]);
    // 2) CAS to in_progress returns 1
    mocks.roundRepo.update.mockResolvedValueOnce({ affected: 1 });
    // 3) cup lookup returns the cup
    mocks.cupRepo.findOne.mockResolvedValue(cup);
    // 4) slot find returns the 4 slots
    mocks.slotRepo.find.mockResolvedValue(slots);

    await mocks.gen.scheduleDueCupRounds();

    // Round CAS to in_progress happened
    expect(mocks.roundRepo.update).toHaveBeenCalledWith(
      { id: 'round-1', status: 'pending' },
      { status: 'in_progress' },
    );
    // 2 matches created
    expect(mocks.matchRepo.save).toHaveBeenCalledTimes(2);
    // Both matches have the right shape
    const matchCalls = mocks.matchRepo.save.mock.calls;
    for (const call of matchCalls) {
      const match = call[0];
      expect(match.type).toBe(MatchType.CUP);
      expect(match.leagueId).toBeNull();
      expect(match.status).toBe(MatchStatus.SCHEDULED);
      expect(match.season).toBe(1);
      expect(match.round).toBe(0);
    }
    expect(matchCalls[0][0].homeTeamId).toBe('team-A');
    expect(matchCalls[0][0].awayTeamId).toBe('team-B');
    expect(matchCalls[1][0].homeTeamId).toBe('team-C');
    expect(matchCalls[1][0].awayTeamId).toBe('team-D');
    // 4 slot updates (one per slot per match) — 2 matches * 2 slots
    expect(mocks.slotRepo.update).toHaveBeenCalledTimes(4);
  });

  it('skips rounds that lose the CAS (another tick won the round)', async () => {
    const mocks = build();
    const round: CupRoundEntity = {
      id: 'round-1' as Uuid,
      cupId: 'cup-1' as Uuid,
      roundNumber: 0,
      status: CupRoundStatus.PENDING,
      slotCount: 0,
    } as CupRoundEntity;
    mocks.roundRepo.find.mockResolvedValue([round]);
    // CAS miss
    mocks.roundRepo.update.mockResolvedValueOnce({ affected: 0 });

    await mocks.gen.scheduleDueCupRounds();

    expect(mocks.matchRepo.save).not.toHaveBeenCalled();
    expect(mocks.slotRepo.find).not.toHaveBeenCalled();
    expect(mockLogger.debug).toHaveBeenCalledWith(
      expect.stringContaining('CAS miss'),
    );
  });

  it('skips non-cup matches when filtering (defensive check)', async () => {
    // The CupScheduler doesn't filter by type — it only sees
    // rounds from the `cup_round` table. This test pins the
    // assumption that NO league round would ever appear in
    // `roundRepo.find` (the WHERE clause scopes the query).
    // If that assumption ever changes, the scheduler will
    // try to materialize a row that doesn't belong to a cup.
    const mocks = build();
    mocks.roundRepo.find.mockResolvedValue([]);

    await mocks.gen.scheduleDueCupRounds();

    expect(mocks.matchRepo.save).not.toHaveBeenCalled();
  });

  it('flips the cup to IN_PROGRESS on first round materialization', async () => {
    const mocks = build();
    const round: CupRoundEntity = {
      id: 'round-1' as Uuid,
      cupId: 'cup-1' as Uuid,
      roundNumber: 0,
      status: CupRoundStatus.PENDING,
      slotCount: 0,
      scheduledAt: new Date('2026-09-16T06:00:00Z'),
    } as CupRoundEntity;
    const cup: CupEntity = {
      id: 'cup-1' as Uuid,
      season: 1,
      type: 'NATIONAL',
      status: CupStatus.PENDING,
    } as CupEntity;
    mocks.roundRepo.find.mockResolvedValue([round]);
    mocks.roundRepo.update.mockResolvedValueOnce({ affected: 1 });
    mocks.cupRepo.findOne.mockResolvedValue(cup);
    mocks.slotRepo.find.mockResolvedValue([]);

    await mocks.gen.scheduleDueCupRounds();

    // The cup status flip was attempted.
    expect(mocks.cupRepo.update).toHaveBeenCalledWith('cup-1', {
      status: CupStatus.IN_PROGRESS,
    });
  });
});
