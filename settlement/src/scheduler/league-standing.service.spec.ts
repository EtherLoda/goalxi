import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { LeagueStandingService } from './league-standing.service';
import {
  LeagueEntity,
  LeagueStandingEntity,
  SeasonResultEntity,
  TeamEntity,
  Uuid,
} from '@goalxi/database';

describe('LeagueStandingService', () => {
  let service: LeagueStandingService;
  let leagueRepository: jest.Mocked<Repository<LeagueEntity>>;
  let standingRepository: jest.Mocked<Repository<LeagueStandingEntity>>;
  let seasonResultRepository: jest.Mocked<Repository<SeasonResultEntity>>;
  let teamRepository: jest.Mocked<Repository<TeamEntity>>;

  const mockLeagueRepository = {
    find: jest.fn(),
  };

  const mockStandingRepository = {
    find: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    delete: jest.fn(),
  };

  const mockSeasonResultRepository = {
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
  };

  const mockTeamRepository = {
    find: jest.fn(),
    findOne: jest.fn(),
  };

  const TIER1_LEAGUE: Partial<LeagueEntity> = {
    id: 'tier1-league-id' as Uuid,
    name: 'Tier 1 League',
    tier: 1,
    tierDivision: 1,
    maxTeams: 16,
    promotionSlots: 1,
    relegationSlots: 4,
  };

  const createMockStanding = (
    teamId: string,
    position: number,
    points: number,
  ): Partial<LeagueStandingEntity> => ({
    id: `standing-${teamId}` as Uuid,
    teamId: teamId as Uuid,
    leagueId: 'tier1-league-id' as Uuid,
    season: 1,
    position,
    played: 15,
    points,
    wins: Math.floor(points / 3),
    draws: points % 3,
    losses: 15 - Math.floor(points / 3) - (points % 3),
    goalsFor: 20 + Math.floor(Math.random() * 20),
    goalsAgainst: 15 + Math.floor(Math.random() * 15),
    goalDifference: 5,
    recentForm: 'WWDLW',
    team: { id: teamId as Uuid, name: `Team ${teamId}` } as any,
    league: TIER1_LEAGUE as LeagueEntity,
  });

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LeagueStandingService,
        {
          provide: getRepositoryToken(LeagueEntity),
          useValue: mockLeagueRepository,
        },
        {
          provide: getRepositoryToken(LeagueStandingEntity),
          useValue: mockStandingRepository,
        },
        {
          provide: getRepositoryToken(SeasonResultEntity),
          useValue: mockSeasonResultRepository,
        },
        {
          provide: getRepositoryToken(TeamEntity),
          useValue: mockTeamRepository,
        },
      ],
    }).compile();

    service = module.get<LeagueStandingService>(LeagueStandingService);
    leagueRepository = module.get(getRepositoryToken(LeagueEntity));
    standingRepository = module.get(getRepositoryToken(LeagueStandingEntity));
    seasonResultRepository = module.get(getRepositoryToken(SeasonResultEntity));
    teamRepository = module.get(getRepositoryToken(TeamEntity));

    jest.clearAllMocks();
  });

  describe('archiveSeasonFinalStandings', () => {
    it('should archive all standings for a season', async () => {
      const standings = [
        createMockStanding('team-1', 1, 45),
        createMockStanding('team-2', 2, 42),
        createMockStanding('team-3', 3, 39),
      ];

      mockStandingRepository.find.mockResolvedValue(
        standings as LeagueStandingEntity[],
      );
      mockSeasonResultRepository.findOne.mockResolvedValue(null);
      mockSeasonResultRepository.create.mockImplementation(
        (data) => data as SeasonResultEntity,
      );
      mockSeasonResultRepository.save.mockResolvedValue(
        {} as SeasonResultEntity,
      );

      await service.archiveSeasonFinalStandings(1);

      expect(mockSeasonResultRepository.create).toHaveBeenCalledTimes(3);
      expect(mockSeasonResultRepository.save).toHaveBeenCalledTimes(3);
    });

    it('should not create duplicate season results', async () => {
      const standings = [createMockStanding('team-1', 1, 45)];

      mockStandingRepository.find.mockResolvedValue(
        standings as LeagueStandingEntity[],
      );
      mockSeasonResultRepository.findOne.mockResolvedValue({
        id: 'existing-result',
      } as SeasonResultEntity);

      await service.archiveSeasonFinalStandings(1);

      // Should not create new result since one exists
      expect(mockSeasonResultRepository.create).not.toHaveBeenCalled();
    });

    it('should handle empty standings', async () => {
      mockStandingRepository.find.mockResolvedValue([]);

      await service.archiveSeasonFinalStandings(1);

      expect(mockSeasonResultRepository.create).not.toHaveBeenCalled();
      expect(mockSeasonResultRepository.save).not.toHaveBeenCalled();
    });
  });

  describe('initNewSeasonStandings', () => {
    it('should create standings for all teams in a league for new season', async () => {
      const currentStandings = [
        createMockStanding('team-1', 1, 45),
        createMockStanding('team-2', 2, 42),
        createMockStanding('team-3', 3, 39),
        createMockStanding('team-4', 4, 36),
      ];

      mockLeagueRepository.find.mockResolvedValue([
        TIER1_LEAGUE as LeagueEntity,
      ]);
      // Mock teams in league (used by initNewSeasonStandings)
      mockTeamRepository.find.mockResolvedValue([
        { id: 'team-1', name: 'Team team-1' },
        { id: 'team-2', name: 'Team team-2' },
        { id: 'team-3', name: 'Team team-3' },
        { id: 'team-4', name: 'Team team-4' },
      ] as TeamEntity[]);
      mockStandingRepository.find.mockResolvedValue(
        currentStandings as LeagueStandingEntity[],
      );
      mockStandingRepository.findOne.mockResolvedValue(null); // No existing standing for new season
      mockStandingRepository.create.mockImplementation(
        (data) => data as LeagueStandingEntity,
      );
      mockStandingRepository.save.mockResolvedValue({} as LeagueStandingEntity);

      await service.initNewSeasonStandings(2);

      // Should create standings for season 2
      expect(mockStandingRepository.create).toHaveBeenCalledTimes(4);
      expect(mockStandingRepository.save).toHaveBeenCalledTimes(4);

      // Verify the created standings have season = 2
      const createCalls = mockStandingRepository.create.mock.calls;
      for (const call of createCalls) {
        expect(call[0].season).toBe(2);
      }
    });

    it('should not duplicate standings if they already exist for new season', async () => {
      const currentStandings = [createMockStanding('team-1', 1, 45)];

      mockLeagueRepository.find.mockResolvedValue([
        TIER1_LEAGUE as LeagueEntity,
      ]);
      mockTeamRepository.find.mockResolvedValue([
        { id: 'team-1', name: 'Team team-1' },
      ] as TeamEntity[]);
      mockStandingRepository.find.mockResolvedValue(
        currentStandings as LeagueStandingEntity[],
      );
      mockStandingRepository.findOne.mockResolvedValue({
        id: 'existing-standing',
      } as LeagueStandingEntity); // Standing already exists for new season

      await service.initNewSeasonStandings(2);

      // Should not create new standing since one exists
      expect(mockStandingRepository.create).not.toHaveBeenCalled();
    });
  });

  describe('resetLeagueStandings', () => {
    it('should delete all standings for a league and season', async () => {
      mockStandingRepository.delete.mockResolvedValue({
        affected: 16,
        raw: [],
      });

      await service.resetLeagueStandings('tier1-league-id', 1);

      expect(mockStandingRepository.delete).toHaveBeenCalledWith({
        leagueId: 'tier1-league-id',
        season: 1,
      });
    });
  });

  describe('getFinalStandings', () => {
    it('should return standings ordered by position', async () => {
      const standings = [
        createMockStanding('team-1', 1, 45),
        createMockStanding('team-2', 2, 42),
        createMockStanding('team-3', 3, 39),
      ];

      mockStandingRepository.find.mockResolvedValue(
        standings as LeagueStandingEntity[],
      );

      const result = await service.getFinalStandings('tier1-league-id', 1);

      expect(mockStandingRepository.find).toHaveBeenCalledWith({
        where: { leagueId: 'tier1-league-id', season: 1 },
        relations: ['team'],
        order: { position: 'ASC' },
      });
      expect(result).toHaveLength(3);
    });
  });
});
