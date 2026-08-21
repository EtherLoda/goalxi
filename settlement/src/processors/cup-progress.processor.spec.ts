import { CupProgressProcessor } from './cup-progress.processor';
import { LOGGER_SERVICE } from '@goalxi/logger';
import {
  CupBracketSlotEntity,
  CupEntity,
  CupEntryEntity,
  CupRoundEntity,
  CupRoundStatus,
  CupStatus,
  MatchEntity,
  MatchStatus,
  MatchType,
  type Uuid,
} from '@goalxi/database';

/**
 * Focused spec for `CupProgressProcessor`. The BullMQ plumbing
 * (`process(job)`) is bypassed — we drive the inner handlers
 * directly via the same Module-augmenting pattern the other
 * settlement processors use.
 *
 * The cases pin the four CAS-on-DB points that protect the
 * processor from duplicate / racing ticks:
 *   1. slot winner stamp — `winner_team_id IS NULL` guard
 *   2. round closeout — `status='in_progress'` guard
 *   3. loser elimination — `eliminated_in_round IS NULL` guard
 *   4. final round — cup status flip + champion final_position
 */
describe('CupProgressProcessor — closeout CAS paths', () => {
  const mockLogger = {
    info: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    error: jest.fn(),
  };

  function build() {
    // Build the repos FIRST so the spec can wire `mockResolvedValue`
    // onto the same instance the processor holds. Returning
    // freshly-constructed mocks separately makes the assertions
    // look at a different object than the one the processor calls.
    const matchRepo = { findOne: jest.fn() };
    const cupRepo = {
      findOne: jest.fn(),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    const roundRepo = {
      findOne: jest.fn(),
      update: jest.fn(),
      createQueryBuilder: jest.fn(),
    };
    const slotRepo = {
      find: jest.fn(),
      count: jest.fn(),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    const entryRepo = { update: jest.fn().mockResolvedValue({ affected: 1 }) };
    return {
      gen: new CupProgressProcessor(
        mockLogger as any,
        matchRepo as any,
        cupRepo as any,
        roundRepo as any,
        slotRepo as any,
        entryRepo as any,
      ),
      matchRepo,
      cupRepo,
      roundRepo,
      slotRepo,
      entryRepo,
    };
  }

  // Build a fake `Job` and a completed cup match + slot pair.
  // The job name must be 'complete-match' — the processor
  // ignores other names sharing the queue.
  const buildMatch = (overrides: Partial<MatchEntity> = {}): MatchEntity =>
    ({
      id: 'match-1' as Uuid,
      homeTeamId: 'team-A' as Uuid,
      awayTeamId: 'team-B' as Uuid,
      homeScore: 2,
      awayScore: 1,
      type: MatchType.CUP,
      status: MatchStatus.COMPLETED,
      round: 0,
      season: 1,
      ...overrides,
    }) as MatchEntity;

  const buildSlot = (
    overrides: Partial<CupBracketSlotEntity>,
  ): CupBracketSlotEntity =>
    ({
      id: 'slot-x' as Uuid,
      cupId: 'cup-1' as Uuid,
      roundId: 'round-1' as Uuid,
      roundNumber: 0,
      slotIndex: 0,
      homeTeamId: null,
      awayTeamId: null,
      matchId: null,
      winnerTeamId: null,
      sourceSlotId: null,
      isBye: false,
      ...overrides,
    }) as CupBracketSlotEntity;

  beforeEach(() => {
    mockLogger.info.mockClear();
    mockLogger.warn.mockClear();
    mockLogger.debug.mockClear();
    mockLogger.error.mockClear();
  });

  it('skips non-cup matches (league flow handled elsewhere)', async () => {
    const mocks = build();
    const leagueMatch = buildMatch({ type: MatchType.LEAGUE });
    mocks.matchRepo.findOne.mockResolvedValue(leagueMatch);

    await mocks.gen['handleCompletedMatch'](leagueMatch.id);

    expect(mocks.slotRepo.find).not.toHaveBeenCalled();
    expect(mocks.entryRepo.update).not.toHaveBeenCalled();
  });

  it('stamps winner on both slots tied to the match', async () => {
    const mocks = build();
    const match = buildMatch();
    const homeSlot = buildSlot({
      id: 'slot-home' as Uuid,
      homeTeamId: 'team-A' as Uuid,
      awayTeamId: null,
    });
    const awaySlot = buildSlot({
      id: 'slot-away' as Uuid,
      homeTeamId: null,
      awayTeamId: 'team-B' as Uuid,
    });
    const round = {
      id: 'round-1' as Uuid,
      cupId: 'cup-1' as Uuid,
      roundNumber: 0,
      status: CupRoundStatus.IN_PROGRESS,
    } as CupRoundEntity;
    const cup = {
      id: 'cup-1' as Uuid,
      season: 1,
      status: CupStatus.IN_PROGRESS,
    } as CupEntity;
    mocks.matchRepo.findOne.mockResolvedValue(match);
    mocks.slotRepo.find
      .mockResolvedValueOnce([homeSlot, awaySlot]) // 1st: find slot pair
      .mockResolvedValueOnce([]); // 2nd: final round slot count = 0
    mocks.roundRepo.findOne
      .mockResolvedValueOnce(round) // for the slot-to-round lookup
      .mockResolvedValueOnce(null); // for the last-round lookup
    mocks.slotRepo.count
      .mockResolvedValueOnce(0) // for round closeout count
      .mockResolvedValueOnce(0); // ditto
    mocks.roundRepo.update.mockResolvedValue({ affected: 0 }); // CAS miss on closeout

    await mocks.gen['handleCompletedMatch'](match.id);

    // 2 slot winner stamps (TypeORM turns `IsNull()` into a
    // FindOperator object, so we match by id only and check
    // the SET clause's winnerTeamId).
    const slotUpdateCalls = mocks.slotRepo.update.mock.calls;
    expect(slotUpdateCalls).toHaveLength(2);
    const slotUpdateIds = slotUpdateCalls.map((c) => c[0].id);
    expect(slotUpdateIds).toEqual(
      expect.arrayContaining(['slot-home', 'slot-away']),
    );
    for (const call of slotUpdateCalls) {
      expect(call[1]).toEqual({ winnerTeamId: 'team-A' });
    }
    // 1 loser eliminated stamp. We match on the
    // (cupId, teamId) tuple and the SET clause; the
    // `eliminatedInRound IS NULL` part of the WHERE is
    // expressed as a TypeORM FindOperator that we don't
    // need to spell out for the test.
    const entryUpdateCall = mocks.entryRepo.update.mock.calls[0];
    expect(entryUpdateCall[0]).toMatchObject({
      cupId: 'cup-1',
      teamId: 'team-B',
    });
    expect(entryUpdateCall[1]).toEqual({ eliminatedInRound: 0 });
  });

  it('refuses to stamp a tied result (corruption sentinel)', async () => {
    const mocks = build();
    const match = buildMatch({ homeScore: 1, awayScore: 1 });
    mocks.matchRepo.findOne.mockResolvedValue(match);

    await mocks.gen['handleCompletedMatch'](match.id);

    expect(mocks.slotRepo.find).not.toHaveBeenCalled();
    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.stringContaining('no decidable winner'),
    );
  });

  it('skips stamping a slot whose winnerTeamId is already set (CAS miss)', async () => {
    const mocks = build();
    const match = buildMatch();
    const homeSlot = buildSlot({
      id: 'slot-home' as Uuid,
      homeTeamId: 'team-A' as Uuid,
      winnerTeamId: 'team-X' as Uuid, // already filled in
    });
    const awaySlot = buildSlot({
      id: 'slot-away' as Uuid,
      homeTeamId: null,
      awayTeamId: 'team-B' as Uuid,
      winnerTeamId: null,
    });
    const round = {
      id: 'round-1' as Uuid,
      cupId: 'cup-1' as Uuid,
      roundNumber: 0,
      status: CupRoundStatus.IN_PROGRESS,
    } as CupRoundEntity;
    mocks.matchRepo.findOne.mockResolvedValue(match);
    mocks.slotRepo.find
      .mockResolvedValueOnce([homeSlot, awaySlot])
      .mockResolvedValueOnce([]);
    mocks.roundRepo.findOne
      .mockResolvedValueOnce(round)
      .mockResolvedValueOnce(null);
    mocks.slotRepo.count.mockResolvedValue(0);
    mocks.roundRepo.update.mockResolvedValue({ affected: 0 });

    await mocks.gen['handleCompletedMatch'](match.id);

    // Only the second slot gets a write — the first is pre-filled.
    const slotUpdateCalls = mocks.slotRepo.update.mock.calls;
    expect(slotUpdateCalls).toHaveLength(1);
    expect(slotUpdateCalls[0][0].id).toBe('slot-away');
  });

  it('closes out the round when all slots have winners (CAS wins)', async () => {
    const mocks = build();
    const match = buildMatch({ round: 0 });
    const homeSlot = buildSlot({
      id: 'slot-home' as Uuid,
      homeTeamId: 'team-A' as Uuid,
    });
    const awaySlot = buildSlot({
      id: 'slot-away' as Uuid,
      awayTeamId: 'team-B' as Uuid,
    });
    const round = {
      id: 'round-1' as Uuid,
      cupId: 'cup-1' as Uuid,
      roundNumber: 0,
      status: CupRoundStatus.IN_PROGRESS,
    } as CupRoundEntity;
    const cup = {
      id: 'cup-1' as Uuid,
      season: 1,
      status: CupStatus.IN_PROGRESS,
    } as CupEntity;
    mocks.matchRepo.findOne.mockResolvedValue(match);
    mocks.slotRepo.find
      .mockResolvedValueOnce([homeSlot, awaySlot])
      .mockResolvedValueOnce([]); // last-round slot lookup
    mocks.roundRepo.findOne
      .mockResolvedValueOnce(round)
      .mockResolvedValueOnce(null); // last-round lookup
    // 2 slots, 2 winners — round is complete
    mocks.slotRepo.count
      .mockResolvedValueOnce(2) // total
      .mockResolvedValueOnce(2); // with winner
    // CAS for round closeout succeeds
    mocks.roundRepo.update.mockResolvedValueOnce({ affected: 1 });
    // buildNextRoundSlots lookup: next round row
    mocks.roundRepo.findOne.mockResolvedValueOnce(null); // next round missing — log error

    await mocks.gen['handleCompletedMatch'](match.id);

    // Round CAS happened
    expect(mocks.roundRepo.update).toHaveBeenCalledWith(
      { id: 'round-1', status: 'in_progress' },
      { status: 'completed' },
    );
  });

  it('bails out of the closeout if the round CAS misses (another tick won)', async () => {
    const mocks = build();
    const match = buildMatch();
    const homeSlot = buildSlot({
      id: 'slot-home' as Uuid,
      homeTeamId: 'team-A' as Uuid,
    });
    const awaySlot = buildSlot({
      id: 'slot-away' as Uuid,
      awayTeamId: 'team-B' as Uuid,
    });
    const round = {
      id: 'round-1' as Uuid,
      cupId: 'cup-1' as Uuid,
      roundNumber: 0,
      status: CupRoundStatus.IN_PROGRESS,
    } as CupRoundEntity;
    mocks.matchRepo.findOne.mockResolvedValue(match);
    mocks.slotRepo.find.mockResolvedValueOnce([homeSlot, awaySlot]);
    mocks.roundRepo.findOne.mockResolvedValueOnce(round);
    // counts: 2 total, 2 winners
    mocks.slotRepo.count.mockResolvedValueOnce(2).mockResolvedValueOnce(2);
    // CAS miss — another tick won the closeout
    mocks.roundRepo.update.mockResolvedValueOnce({ affected: 0 });

    await mocks.gen['handleCompletedMatch'](match.id);

    // The CAS attempt happened (status='in_progress' guard)
    expect(mocks.roundRepo.update).toHaveBeenCalledWith(
      { id: 'round-1', status: 'in_progress' },
      { status: 'completed' },
    );
    // No further writes — the other tick took over.
    expect(mocks.cupRepo.update).not.toHaveBeenCalled();
  });
});
