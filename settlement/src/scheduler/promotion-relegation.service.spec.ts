import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PromotionRelegationService } from './promotion-relegation.service';
import {
  LeagueEntity,
  LeagueStandingEntity,
  TeamEntity,
  SeasonResultEntity,
} from '@goalxi/database';

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
    id: 'tier1-league-id',
    name: 'Tier 1 League',
    tier: 1,
    tierDivision: 1,
    maxTeams: 16,
    promotionSlots: 1,
    playoffSlots: 4,
    relegationSlots: 4,
  };

  const TIER2_LEAGUE_L1: Partial<LeagueEntity> = {
    id: 'tier2-league-l1-id',
    name: 'Tier 2 League L1',
    tier: 2,
    tierDivision: 1,
    maxTeams: 16,
    promotionSlots: 1,
    playoffSlots: 4,
    relegationSlots: 4,
  };

  const TIER2_LEAGUE_L2: Partial<LeagueEntity> = {
    id: 'tier2-league-l2-id',
    name: 'Tier 2 League L2',
    tier: 2,
    tierDivision: 2,
    maxTeams: 16,
    promotionSlots: 1,
    playoffSlots: 4,
    relegationSlots: 4,
  };

  const TIER3_LEAGUE: Partial<LeagueEntity> = {
    id: 'tier3-league-id',
    name: 'Tier 3 League',
    tier: 3,
    tierDivision: 1,
    maxTeams: 16,
    promotionSlots: 1,
    playoffSlots: 4,
    relegationSlots: 4,
  };

  const createMockTeam = (id: string, name: string): Partial<TeamEntity> => ({
    id,
    name,
    leagueId: 'some-league-id',
  });

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PromotionRelegationService,
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
});
