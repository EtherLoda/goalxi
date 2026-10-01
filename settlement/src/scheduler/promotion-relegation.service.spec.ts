import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PromotionRelegationService } from './promotion-relegation.service';
import {
  LeagueEntity,
  LeagueStandingEntity,
  TeamEntity,
  SeasonResultEntity,
  FanEntity,
  Uuid,
} from '@goalxi/database';
import { LOGGER_SERVICE_PROVIDER } from '../test-utils/test-logger';

describe('PromotionRelegationService', () => {
  let service: PromotionRelegationService;
  let leagueRepository: jest.Mocked<Repository<LeagueEntity>>;
  let standingRepository: jest.Mocked<Repository<LeagueStandingEntity>>;
  let teamRepository: jest.Mocked<Repository<TeamEntity>>;
  let seasonResultRepository: jest.Mocked<Repository<SeasonResultEntity>>;
  let fanRepository: jest.Mocked<Repository<FanEntity>>;

  const mockLeagueRepository = {
    find: jest.fn(),
    findOne: jest.fn(),
  };

  const mockStandingRepository = {
    find: jest.fn(),
    findOne: jest.fn(),
  };

  const mockTeamRepository = {
    findOne: jest.fn(),
    save: jest.fn(),
  };

  const mockSeasonResultRepository = {
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
  };

  const mockFanRepository = {
    findOne: jest.fn(),
    save: jest.fn(),
  };

  const TIER1_LEAGUE: Partial<LeagueEntity> = {
    id: 'tier1-league-id' as Uuid,
    name: 'Tier 1 League',
    tier: 1,
    tierDivision: 1,
    maxTeams: 16,
    promotionSlots: 1,
    playoffSlots: 4,
    relegationSlots: 4,
  };

  const TIER2_LEAGUE_L1: Partial<LeagueEntity> = {
    id: 'tier2-league-l1-id' as Uuid,
    name: 'Tier 2 League L1',
    tier: 2,
    tierDivision: 1,
    maxTeams: 16,
    promotionSlots: 1,
    playoffSlots: 4,
    relegationSlots: 4,
  };

  const TIER2_LEAGUE_L2: Partial<LeagueEntity> = {
    id: 'tier2-league-l2-id' as Uuid,
    name: 'Tier 2 League L2',
    tier: 2,
    tierDivision: 2,
    maxTeams: 16,
    promotionSlots: 1,
    playoffSlots: 4,
    relegationSlots: 4,
  };

  const TIER3_LEAGUE: Partial<LeagueEntity> = {
    id: 'tier3-league-id' as Uuid,
    name: 'Tier 3 League',
    tier: 3,
    tierDivision: 1,
    maxTeams: 16,
    promotionSlots: 1,
    playoffSlots: 4,
    relegationSlots: 4,
  };

  const createMockTeam = (id: string, name: string): Partial<TeamEntity> => ({
    id: id as Uuid,
    name,
    leagueId: 'some-league-id' as Uuid,
  });

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PromotionRelegationService,
        LOGGER_SERVICE_PROVIDER,
        {
          provide: getRepositoryToken(LeagueEntity),
          useValue: mockLeagueRepository,
        },
        {
          provide: getRepositoryToken(LeagueStandingEntity),
          useValue: mockStandingRepository,
        },
        {
          provide: getRepositoryToken(TeamEntity),
          useValue: mockTeamRepository,
        },
        {
          provide: getRepositoryToken(SeasonResultEntity),
          useValue: mockSeasonResultRepository,
        },
        {
          provide: getRepositoryToken(FanEntity),
          useValue: mockFanRepository,
        },
      ],
    }).compile();

    service = module.get<PromotionRelegationService>(
      PromotionRelegationService,
    );
    leagueRepository = module.get(getRepositoryToken(LeagueEntity));
    standingRepository = module.get(getRepositoryToken(LeagueStandingEntity));
    teamRepository = module.get(getRepositoryToken(TeamEntity));
    seasonResultRepository = module.get(getRepositoryToken(SeasonResultEntity));
    fanRepository = module.get(getRepositoryToken(FanEntity));

    // Reset all mocks
    jest.clearAllMocks();

    // Default: no fan row exists. swapTeamLeague should treat that
    // as "skip reward" — same as production. Individual tests that
    // want to exercise the reward path override this.
    mockFanRepository.findOne.mockResolvedValue(null);
  });

  describe('processAllTiers', () => {
    it('should process leagues from highest to lowest tier', async () => {
      // Setup: Two tier leagues
      mockLeagueRepository.find.mockResolvedValue([
        TIER1_LEAGUE as LeagueEntity,
        TIER2_LEAGUE_L1 as LeagueEntity,
      ]);

      // T1 standings: team at position 1 (promote), positions 13-16 (relegate)
      const t1Standing1 = {
        teamId: 't1-team-1',
        position: 1,
        team: createMockTeam('t1-team-1', 'T1 First Place'),
      };
      const t1Standing13 = {
        teamId: 't1-team-13',
        position: 13,
        team: createMockTeam('t1-team-13', 'T1 13th'),
      };
      const t1Standing14 = {
        teamId: 't1-team-14',
        position: 14,
        team: createMockTeam('t1-team-14', 'T1 14th'),
      };
      const t1Standing15 = {
        teamId: 't1-team-15',
        position: 15,
        team: createMockTeam('t1-team-15', 'T1 15th'),
      };
      const t1Standing16 = {
        teamId: 't1-team-16',
        position: 16,
        team: createMockTeam('t1-team-16', 'T1 16th'),
      };

      mockStandingRepository.find.mockImplementation(async (options: any) => {
        if (options.where.leagueId === 'tier1-league-id') {
          return [
            t1Standing1,
            t1Standing13,
            t1Standing14,
            t1Standing15,
            t1Standing16,
          ];
        }
        return [];
      });

      // T1 is top tier, no upper league
      mockTeamRepository.findOne.mockResolvedValue(
        createMockTeam('t1-team-1', 'T1 First Place') as TeamEntity,
      );
      mockTeamRepository.save.mockResolvedValue({} as TeamEntity);
      mockSeasonResultRepository.findOne.mockResolvedValue(null);
      mockSeasonResultRepository.create.mockReturnValue(
        {} as SeasonResultEntity,
      );
      mockSeasonResultRepository.save.mockResolvedValue(
        {} as SeasonResultEntity,
      );

      await service.processAllTiers(1);

      // Verify standings were queried
      expect(mockStandingRepository.find).toHaveBeenCalled();
    });
  });

  describe('swapTeamLeague', () => {
    it('REGRESSION: a second call is a no-op (a swap is not commutative)', async () => {
      // `processAllTiers` — the direct path's only caller — has no
      // idempotency latch (unlike the playoff path's
      // `match.playoff_swapped_at`). It reads `standing.position`, which
      // the swap never mutates, so a second run re-reads identical
      // positions and re-executes identical swaps.
      //
      // That is reachable: `SeasonTransitionService
      // .checkAndProcessSeasonStart` logs-and-rethrows, so a failure in a
      // later step (e.g. schedule generation hitting a league that
      // drifted to an odd team count) makes the next tick re-run
      // promotions — and UN-SWAP every pair, returning each team to the
      // league it was trying to leave.
      //
      // Idempotency comes from current membership rather than a marker
      // column: a leg whose team already sits in its target league is
      // skipped, so on a re-run BOTH legs no-op.
      const upperTeam = {
        ...createMockTeam('upper-team-id', 'Upper Team'),
        leagueId: 'upper-league-id' as Uuid,
      } as TeamEntity;
      const lowerTeam = {
        ...createMockTeam('lower-team-id', 'Lower Team'),
        leagueId: 'lower-league-id' as Uuid,
      } as TeamEntity;

      mockTeamRepository.findOne
        .mockResolvedValueOnce(upperTeam)
        .mockResolvedValueOnce(lowerTeam)
        // Second call: the rows now read back post-swap.
        .mockResolvedValueOnce({
          ...upperTeam,
          leagueId: 'lower-league-id',
        } as TeamEntity)
        .mockResolvedValueOnce({
          ...lowerTeam,
          leagueId: 'upper-league-id',
        } as TeamEntity);
      mockTeamRepository.save.mockResolvedValue({} as TeamEntity);
      const fanSpy = jest
        .spyOn(
          service as unknown as {
            applyFanRewardForTierChange: (
              id: string,
              dir: string,
            ) => Promise<void>;
          },
          'applyFanRewardForTierChange',
        )
        .mockResolvedValue(undefined);

      await service.swapTeamLeague(
        'upper-team-id',
        'lower-team-id',
        'upper-league-id',
        'lower-league-id',
      );
      expect(mockTeamRepository.save).toHaveBeenCalledTimes(2);

      // Re-run: both teams are already in their target leagues.
      mockTeamRepository.save.mockClear();
      await service.swapTeamLeague(
        'upper-team-id',
        'lower-team-id',
        'upper-league-id',
        'lower-league-id',
      );

      expect(mockTeamRepository.save).not.toHaveBeenCalled();
      // The tier-change fan reward is not paid again either.
      expect(fanSpy).toHaveBeenCalledTimes(2);
    });

    it('should swap leagueIds when lowerTeamId is provided', async () => {
      const upperTeam = createMockTeam(
        'upper-team-id',
        'Upper Team',
      ) as TeamEntity;
      const lowerTeam = createMockTeam(
        'lower-team-id',
        'Lower Team',
      ) as TeamEntity;

      mockTeamRepository.findOne
        .mockResolvedValueOnce(upperTeam)
        .mockResolvedValueOnce(lowerTeam);
      mockTeamRepository.save.mockResolvedValue({} as TeamEntity);

      await service.swapTeamLeague(
        'upper-team-id',
        'lower-team-id',
        'upper-league-id',
        'lower-league-id',
      );

      // Upper team should move to lower league
      expect(mockTeamRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'upper-team-id',
          leagueId: 'lower-league-id',
        }),
      );

      // Lower team should move to upper league
      expect(mockTeamRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'lower-team-id',
          leagueId: 'upper-league-id',
        }),
      );
    });

    it('should only update upper team when lowerTeamId is null', async () => {
      const upperTeam = createMockTeam(
        'upper-team-id',
        'Upper Team',
      ) as TeamEntity;

      mockTeamRepository.findOne.mockResolvedValue(upperTeam);
      mockTeamRepository.save.mockResolvedValue({} as TeamEntity);

      await service.swapTeamLeague(
        'upper-team-id',
        null,
        'upper-league-id',
        'lower-league-id',
      );

      // Should only be called once (for upper team)
      expect(mockTeamRepository.save).toHaveBeenCalledTimes(1);
      expect(mockTeamRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'upper-team-id',
          leagueId: 'lower-league-id',
        }),
      );
    });

    it('applies the relegation reward to the upper team when it has a FanEntity', async () => {
      // The `upperTeamId` argument is the *relegated* team (moves to
      // the lower league). The fan reward path should fire for them.
      const upperTeam = createMockTeam(
        'relegated-team-id',
        'Relegated FC',
      ) as TeamEntity;
      const fan = {
        teamId: 'relegated-team-id',
        totalFans: 10_000,
        fanEmotion: 50,
        recentForm: 'WWDLL',
      } as FanEntity;

      mockTeamRepository.findOne.mockResolvedValue(upperTeam);
      mockTeamRepository.save.mockResolvedValue({} as TeamEntity);
      mockFanRepository.findOne.mockResolvedValue(fan);
      mockFanRepository.save.mockResolvedValue(fan);

      await service.swapTeamLeague(
        'relegated-team-id',
        null,
        'upper-league-id',
        'lower-league-id',
      );

      // Relegation: -10% fans, -20 emotion, recentForm cleared.
      expect(fan.totalFans).toBe(9_000);
      expect(fan.fanEmotion).toBe(30);
      expect(fan.recentForm).toBe('');
      expect(mockFanRepository.save).toHaveBeenCalledWith(fan);
    });

    it('applies the promotion reward to the lower team when both teams swap', async () => {
      // The `lowerTeamId` argument is the *promoted* team (moves to
      // the upper league). The fan reward path should fire for them
      // while the upper team gets the relegation reward.
      const upperTeam = createMockTeam(
        'relegated-team-id',
        'Relegated FC',
      ) as TeamEntity;
      const lowerTeam = createMockTeam(
        'promoted-team-id',
        'Promoted FC',
      ) as TeamEntity;
      const upperFan = {
        teamId: 'relegated-team-id',
        totalFans: 20_000,
        fanEmotion: 80,
        recentForm: 'LLDLW',
      } as FanEntity;
      const lowerFan = {
        teamId: 'promoted-team-id',
        totalFans: 5_000,
        fanEmotion: 60,
        recentForm: 'WWWWW',
      } as FanEntity;

      mockTeamRepository.findOne
        .mockResolvedValueOnce(upperTeam)
        .mockResolvedValueOnce(lowerTeam);
      mockTeamRepository.save.mockResolvedValue({} as TeamEntity);
      mockFanRepository.findOne
        .mockResolvedValueOnce(upperFan)
        .mockResolvedValueOnce(lowerFan);
      mockFanRepository.save.mockResolvedValue({} as FanEntity);

      await service.swapTeamLeague(
        'relegated-team-id',
        'promoted-team-id',
        'upper-league-id',
        'lower-league-id',
      );

      // Relegated team: -10% / -20 / cleared
      expect(upperFan.totalFans).toBe(18_000);
      expect(upperFan.fanEmotion).toBe(60);
      // Promoted team: +10% / +20 / cleared
      expect(lowerFan.totalFans).toBe(5_500);
      expect(lowerFan.fanEmotion).toBe(80);
      expect(upperFan.recentForm).toBe('');
      expect(lowerFan.recentForm).toBe('');

      // Both fan rows are persisted.
      expect(mockFanRepository.save).toHaveBeenCalledTimes(2);
    });

    it('skips the fan reward when the team has no FanEntity row (no throw, no log noise beyond debug)', async () => {
      // The default `mockFanRepository.findOne.mockResolvedValue(null)`
      // in beforeEach already covers this — we just assert the team
      // save still happens and the fan repo is left alone.
      const upperTeam = createMockTeam(
        'relegated-team-id',
        'Relegated FC',
      ) as TeamEntity;

      mockTeamRepository.findOne.mockResolvedValue(upperTeam);
      mockTeamRepository.save.mockResolvedValue({} as TeamEntity);

      await service.swapTeamLeague(
        'relegated-team-id',
        null,
        'upper-league-id',
        'lower-league-id',
      );

      // Team save happened.
      expect(mockTeamRepository.save).toHaveBeenCalledTimes(1);
      // Fan save was NOT attempted (findOne returned null).
      expect(mockFanRepository.save).not.toHaveBeenCalled();
    });
  });

  describe('processLeaguePromotions', () => {
    it('should promote team at position 1', async () => {
      // This is a tier-2 league (TIER2_LEAGUE_L1) — promotion
      // means #1 swaps with the upper tier's #13 (the
      // tierDivision=1 mapping).
      const ourChampionStanding = {
        teamId: 'team-1',
        position: 1,
        team: createMockTeam('team-1', 'First Place'),
      };
      mockStandingRepository.find.mockResolvedValue([
        ourChampionStanding,
      ] as any);

      // First findOne: getUpperLeague({tier: 1, tierDivision: 1}) → TIER1.
      // Second findOne: child leagues (parentLeagueId: TIER2_LEAGUE_L1.id) → [].
      mockLeagueRepository.findOne.mockResolvedValueOnce(
        TIER1_LEAGUE as LeagueEntity,
      );
      mockLeagueRepository.find.mockResolvedValueOnce([] as any);

      // standingRepository.findOne: upper's #13 standing (the team that
      // gets swapped down into TIER2_LEAGUE_L1).
      mockStandingRepository.findOne.mockResolvedValueOnce({
        teamId: 'upper-13',
        position: 13,
        team: createMockTeam('upper-13', 'Upper 13th'),
      } as any);

      // swapTeamLeague does two team lookups (upper side then lower side)
      // and two saves. saveSeasonResult is called twice (one for the
      // promoted, one for the relegated) — each does a findOne first.
      mockTeamRepository.findOne
        .mockResolvedValueOnce(createMockTeam('upper-13', 'Upper 13th'))
        .mockResolvedValueOnce(createMockTeam('team-1', 'First Place'));
      mockTeamRepository.save.mockResolvedValue({} as TeamEntity);
      mockSeasonResultRepository.findOne.mockResolvedValue(null);
      mockSeasonResultRepository.create.mockReturnValue(
        {} as SeasonResultEntity,
      );
      mockSeasonResultRepository.save.mockResolvedValue(
        {} as SeasonResultEntity,
      );

      await service.processLeaguePromotions(TIER2_LEAGUE_L1 as LeagueEntity, 1);

      // First place should be promoted
      expect(mockTeamRepository.save).toHaveBeenCalled();
    });

    it('should relegate teams at positions 13-16', async () => {
      const standings = [
        {
          teamId: 'team-13',
          position: 13,
          team: createMockTeam('team-13', '13th Place'),
        },
        {
          teamId: 'team-14',
          position: 14,
          team: createMockTeam('team-14', '14th Place'),
        },
        {
          teamId: 'team-15',
          position: 15,
          team: createMockTeam('team-15', '15th Place'),
        },
        {
          teamId: 'team-16',
          position: 16,
          team: createMockTeam('team-16', '16th Place'),
        },
      ];

      mockStandingRepository.find.mockResolvedValue(standings as any);

      // T1 has no lower league to relegate to (it's at bottom)
      mockLeagueRepository.findOne.mockResolvedValue(null);

      mockTeamRepository.findOne.mockResolvedValue(
        createMockTeam('team-13', '13th Place') as TeamEntity,
      );
      mockTeamRepository.save.mockResolvedValue({} as TeamEntity);
      mockSeasonResultRepository.findOne.mockResolvedValue(null);
      mockSeasonResultRepository.create.mockReturnValue(
        {} as SeasonResultEntity,
      );
      mockSeasonResultRepository.save.mockResolvedValue(
        {} as SeasonResultEntity,
      );

      await service.processLeaguePromotions(TIER1_LEAGUE as LeagueEntity, 1);

      // At bottom tier, no lower league exists - should log and not swap
      expect(mockTeamRepository.save).not.toHaveBeenCalled();
    });

    it('should skip if no standings found', async () => {
      mockStandingRepository.find.mockResolvedValue([]);

      await service.processLeaguePromotions(TIER1_LEAGUE as LeagueEntity, 1);

      expect(mockTeamRepository.save).not.toHaveBeenCalled();
    });
  });

  describe('processPlayoffResultsAndExecuteSwaps', () => {
    it('should not swap when the upper team won (stays in upper league)', async () => {
      const upperTeam = createMockTeam('upper', 'Upper') as TeamEntity;
      const lowerTeam = createMockTeam('lower', 'Lower') as TeamEntity;
      const upperLeague = {
        id: 'upper-league',
        name: 'Upper League',
      } as LeagueEntity;
      const lowerLeague = {
        id: 'lower-league',
        name: 'Lower League',
      } as LeagueEntity;

      await service.processPlayoffResultsAndExecuteSwaps([
        {
          upperTeam,
          lowerTeam,
          upperLeague,
          lowerLeague,
          upperWon: true,
        },
      ]);

      // The only way to keep the upper team in the upper league
      // when the playoff says "swap" is to do nothing. So no save,
      // no log noise beyond the stay-in-place info.
      expect(mockTeamRepository.save).not.toHaveBeenCalled();
      expect(mockTeamRepository.findOne).not.toHaveBeenCalled();
    });

    it('should swap leagueIds when the lower team won the playoff', async () => {
      const upperTeam = createMockTeam('upper', 'Upper FC') as TeamEntity;
      const lowerTeam = createMockTeam('lower', 'Lower FC') as TeamEntity;
      const upperLeague = {
        id: 'upper-league',
        name: 'Premier',
      } as LeagueEntity;
      const lowerLeague = {
        id: 'lower-league',
        name: 'Championship',
      } as LeagueEntity;

      mockTeamRepository.findOne
        .mockResolvedValueOnce({ ...upperTeam } as TeamEntity)
        .mockResolvedValueOnce({ ...lowerTeam } as TeamEntity);
      mockTeamRepository.save.mockResolvedValue({} as TeamEntity);

      await service.processPlayoffResultsAndExecuteSwaps([
        {
          upperTeam,
          lowerTeam,
          upperLeague,
          lowerLeague,
          upperWon: false,
        },
      ]);

      // Upper team is relegated to the lower league.
      expect(mockTeamRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'upper',
          leagueId: 'lower-league',
        }),
      );
      // Lower team is promoted to the upper league.
      expect(mockTeamRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'lower',
          leagueId: 'upper-league',
        }),
      );
    });

    it('should handle a mix of won and lost playoffs in one batch', async () => {
      const upperA = createMockTeam('A-upper', 'A Upper') as TeamEntity;
      const lowerA = createMockTeam('A-lower', 'A Lower') as TeamEntity;
      const upperB = createMockTeam('B-upper', 'B Upper') as TeamEntity;
      const lowerB = createMockTeam('B-lower', 'B Lower') as TeamEntity;
      const leagueA = { id: 'L1', name: 'L1' } as LeagueEntity;
      const leagueB = { id: 'L2', name: 'L2' } as LeagueEntity;

      // Only the "lower wins" playoff needs team fetches.
      mockTeamRepository.findOne
        .mockResolvedValueOnce({ ...upperB } as TeamEntity)
        .mockResolvedValueOnce({ ...lowerB } as TeamEntity);
      mockTeamRepository.save.mockResolvedValue({} as TeamEntity);

      await service.processPlayoffResultsAndExecuteSwaps([
        // A: upper wins → no swap
        {
          upperTeam: upperA,
          lowerTeam: lowerA,
          upperLeague: leagueA,
          lowerLeague: leagueB,
          upperWon: true,
        },
        // B: lower wins → swap
        {
          upperTeam: upperB,
          lowerTeam: lowerB,
          upperLeague: leagueA,
          lowerLeague: leagueB,
          upperWon: false,
        },
      ]);

      // Exactly the swap-pair was saved (2 saves).
      const saved = mockTeamRepository.save.mock.calls.map((c) => c[0]);
      const savedIds = saved.map((s: TeamEntity) => s.id);
      expect(savedIds).toEqual(expect.arrayContaining(['B-upper', 'B-lower']));
      expect(savedIds).not.toContain('A-upper');
      expect(savedIds).not.toContain('A-lower');
    });

    it('should be a no-op for an empty playoff list', async () => {
      await service.processPlayoffResultsAndExecuteSwaps([]);

      expect(mockTeamRepository.save).not.toHaveBeenCalled();
      expect(mockTeamRepository.findOne).not.toHaveBeenCalled();
    });
  });
});
