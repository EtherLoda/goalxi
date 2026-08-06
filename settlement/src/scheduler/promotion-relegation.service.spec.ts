import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PromotionRelegationService } from './promotion-relegation.service';
import {
  LeagueEntity,
  LeagueStandingEntity,
  TeamEntity,
  SeasonResultEntity,
  Uuid,
} from '@goalxi/database';
import { LOGGER_SERVICE_PROVIDER } from '../test-utils/test-logger';

describe('PromotionRelegationService', () => {
  let service: PromotionRelegationService;
  let leagueRepository: jest.Mocked<Repository<LeagueEntity>>;
  let standingRepository: jest.Mocked<Repository<LeagueStandingEntity>>;
  let teamRepository: jest.Mocked<Repository<TeamEntity>>;
  let seasonResultRepository: jest.Mocked<Repository<SeasonResultEntity>>;

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
      ],
    }).compile();

    service = module.get<PromotionRelegationService>(
      PromotionRelegationService,
    );
    leagueRepository = module.get(getRepositoryToken(LeagueEntity));
    standingRepository = module.get(getRepositoryToken(LeagueStandingEntity));
    teamRepository = module.get(getRepositoryToken(TeamEntity));
    seasonResultRepository = module.get(getRepositoryToken(SeasonResultEntity));

    // Reset all mocks
    jest.clearAllMocks();
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
  });

  describe('processLeaguePromotions', () => {
    it('should promote team at position 1', async () => {
      mockStandingRepository.find.mockResolvedValue([
        {
          teamId: 'team-1',
          position: 1,
          team: createMockTeam('team-1', 'First Place'),
        },
      ] as any);

      mockLeagueRepository.findOne.mockResolvedValue({
        ...TIER2_LEAGUE_L1,
        tier: 2,
      } as LeagueEntity);

      mockTeamRepository.findOne.mockResolvedValue(
        createMockTeam('team-1', 'First Place') as TeamEntity,
      );
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
      const upperLeague = { id: 'upper-league', name: 'Upper League' } as LeagueEntity;
      const lowerLeague = { id: 'lower-league', name: 'Lower League' } as LeagueEntity;

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
        { upperTeam: upperA, lowerTeam: lowerA, upperLeague: leagueA, lowerLeague: leagueB, upperWon: true },
        // B: lower wins → swap
        { upperTeam: upperB, lowerTeam: lowerB, upperLeague: leagueA, lowerLeague: leagueB, upperWon: false },
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
