import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SeasonArchiveService } from './season-archive.service';
import { LOGGER_SERVICE_PROVIDER } from '../test-utils/test-logger';
import {
  PlayerCompetitionStatsEntity,
  TransactionEntity,
  PlayerEventEntity,
  LeagueStandingEntity,
  ArchivedSeasonResultEntity,
  ArchivedPlayerCompetitionStatsEntity,
  ArchivedTransactionEntity,
  ArchivedPlayerEventEntity,
  LeagueEntity,
  TeamEntity,
  PlayerEventType,
  TransactionType,
  Uuid,
} from '@goalxi/database';

describe('SeasonArchiveService', () => {
  let service: SeasonArchiveService;
  let playerStatsRepo: jest.Mocked<Repository<PlayerCompetitionStatsEntity>>;
  let transactionRepo: jest.Mocked<Repository<TransactionEntity>>;
  let playerEventRepo: jest.Mocked<Repository<PlayerEventEntity>>;
  let standingRepo: jest.Mocked<Repository<LeagueStandingEntity>>;
  let archivedSeasonResultRepo: jest.Mocked<
    Repository<ArchivedSeasonResultEntity>
  >;
  let archivedPlayerStatsRepo: jest.Mocked<
    Repository<ArchivedPlayerCompetitionStatsEntity>
  >;
  let archivedTransactionRepo: jest.Mocked<
    Repository<ArchivedTransactionEntity>
  >;
  let archivedPlayerEventRepo: jest.Mocked<
    Repository<ArchivedPlayerEventEntity>
  >;

  const mockPlayerStatsRepo = { find: jest.fn() };
  const mockTransactionRepo = { find: jest.fn() };
  const mockPlayerEventRepo = { find: jest.fn() };
  const mockStandingRepo = { find: jest.fn() };
  const mockArchivedSeasonResultRepo = { create: jest.fn(), insert: jest.fn() };
  const mockArchivedPlayerStatsRepo = { create: jest.fn(), insert: jest.fn() };
  const mockArchivedTransactionRepo = { create: jest.fn(), insert: jest.fn() };
  const mockArchivedPlayerEventRepo = { create: jest.fn(), insert: jest.fn() };

  // The create() helper just identity-maps the input so the resulting
  // archived rows are easy to assert against in the test body.
  const identity = (x: any) => x;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SeasonArchiveService,
        LOGGER_SERVICE_PROVIDER,
        {
          provide: getRepositoryToken(PlayerCompetitionStatsEntity),
          useValue: mockPlayerStatsRepo,
        },
        {
          provide: getRepositoryToken(TransactionEntity),
          useValue: mockTransactionRepo,
        },
        {
          provide: getRepositoryToken(PlayerEventEntity),
          useValue: mockPlayerEventRepo,
        },
        {
          provide: getRepositoryToken(LeagueStandingEntity),
          useValue: mockStandingRepo,
        },
        {
          provide: getRepositoryToken(ArchivedSeasonResultEntity),
          useValue: mockArchivedSeasonResultRepo,
        },
        {
          provide: getRepositoryToken(ArchivedPlayerCompetitionStatsEntity),
          useValue: mockArchivedPlayerStatsRepo,
        },
        {
          provide: getRepositoryToken(ArchivedTransactionEntity),
          useValue: mockArchivedTransactionRepo,
        },
        {
          provide: getRepositoryToken(ArchivedPlayerEventEntity),
          useValue: mockArchivedPlayerEventRepo,
        },
      ],
    }).compile();

    service = module.get<SeasonArchiveService>(SeasonArchiveService);
    playerStatsRepo = module.get(
      getRepositoryToken(PlayerCompetitionStatsEntity),
    );
    transactionRepo = module.get(getRepositoryToken(TransactionEntity));
    playerEventRepo = module.get(getRepositoryToken(PlayerEventEntity));
    standingRepo = module.get(getRepositoryToken(LeagueStandingEntity));
    archivedSeasonResultRepo = module.get(
      getRepositoryToken(ArchivedSeasonResultEntity),
    );
    archivedPlayerStatsRepo = module.get(
      getRepositoryToken(ArchivedPlayerCompetitionStatsEntity),
    );
    archivedTransactionRepo = module.get(
      getRepositoryToken(ArchivedTransactionEntity),
    );
    archivedPlayerEventRepo = module.get(
      getRepositoryToken(ArchivedPlayerEventEntity),
    );

    jest.clearAllMocks();
    mockArchivedSeasonResultRepo.create.mockImplementation(identity);
    mockArchivedPlayerStatsRepo.create.mockImplementation(identity);
    mockArchivedTransactionRepo.create.mockImplementation(identity);
    mockArchivedPlayerEventRepo.create.mockImplementation(identity);
  });

  describe('archiveSeason', () => {
    it('archives every row of every entity type in the right repo', async () => {
      // Standings drive the seasonResult archive.
      mockStandingRepo.find.mockResolvedValue([
        {
          teamId: 't-1' as Uuid,
          leagueId: 'L-1' as Uuid,
          season: 1,
          position: 1,
          points: 60,
          wins: 18,
          draws: 6,
          losses: 6,
          goalsFor: 50,
          goalsAgainst: 30,
          goalDifference: 20,
          team: { id: 't-1' as Uuid, name: 'Champions' } as TeamEntity,
          league: {
            id: 'L-1' as Uuid,
            promotionSlots: 1,
            maxTeams: 16,
            relegationSlots: 4,
          } as LeagueEntity,
        },
        {
          teamId: 't-16' as Uuid,
          leagueId: 'L-1' as Uuid,
          season: 1,
          position: 16,
          points: 12,
          wins: 3,
          draws: 3,
          losses: 24,
          goalsFor: 18,
          goalsAgainst: 60,
          goalDifference: -42,
          team: { id: 't-16' as Uuid, name: 'Relegated' } as TeamEntity,
          league: {
            id: 'L-1' as Uuid,
            promotionSlots: 1,
            maxTeams: 16,
            relegationSlots: 4,
          } as LeagueEntity,
        },
      ] as any);

      mockPlayerStatsRepo.find.mockResolvedValue([
        {
          playerId: 1,
          leagueId: 'L-1' as Uuid,
          season: 1,
          goals: 20,
          assists: 5,
          tackles: 30,
          yellowCards: 2,
          redCards: 0,
          starts: 30,
          substituteAppearances: 0,
          appearances: 30,
        } as any,
      ]);
      mockTransactionRepo.find.mockResolvedValue([
        {
          teamId: 't-1' as Uuid,
          season: 1,
          amount: 1_000_000,
          type: TransactionType.PRIZE_MONEY,
          description: '1st',
          relatedId: null,
        } as any,
      ]);
      mockPlayerEventRepo.find.mockResolvedValue([
        {
          playerId: 1,
          season: 1,
          date: new Date(),
          eventType: PlayerEventType.GOLDEN_BOOT,
          icon: 'emoji_events',
          titleKey: 'k',
          matchId: null,
          titleData: null,
          details: {},
        } as any,
      ]);

      const summary = await service.archiveSeason(1);

      // Every entity type is archived with the right count.
      expect(archivedSeasonResultRepo.insert).toHaveBeenCalledTimes(1);
      expect(archivedPlayerStatsRepo.insert).toHaveBeenCalledTimes(1);
      expect(archivedTransactionRepo.insert).toHaveBeenCalledTimes(1);
      expect(archivedPlayerEventRepo.insert).toHaveBeenCalledTimes(1);
      expect(summary).toEqual({
        season: 1,
        seasonResultCount: 2,
        playerStatsCount: 1,
        transactionCount: 1,
        playerEventCount: 1,
      });

      // The position-1 row is marked promoted (≤ promotionSlots);
      // the position-16 row is marked relegated (≥ maxTeams - relegationSlots + 1).
      const archivedRows = archivedSeasonResultRepo.insert.mock.calls[0][0];
      expect(archivedRows[0].promoted).toBe(true);
      expect(archivedRows[0].relegated).toBe(false);
      expect(archivedRows[1].promoted).toBe(false);
      expect(archivedRows[1].relegated).toBe(true);
    });

    it('skips writes and returns zero counts when there is no data to archive', async () => {
      mockStandingRepo.find.mockResolvedValue([]);
      mockPlayerStatsRepo.find.mockResolvedValue([]);
      mockTransactionRepo.find.mockResolvedValue([]);
      mockPlayerEventRepo.find.mockResolvedValue([]);

      const summary = await service.archiveSeason(7);

      expect(archivedSeasonResultRepo.insert).not.toHaveBeenCalled();
      expect(archivedPlayerStatsRepo.insert).not.toHaveBeenCalled();
      expect(archivedTransactionRepo.insert).not.toHaveBeenCalled();
      expect(archivedPlayerEventRepo.insert).not.toHaveBeenCalled();
      expect(summary).toEqual({
        season: 7,
        seasonResultCount: 0,
        playerStatsCount: 0,
        transactionCount: 0,
        playerEventCount: 0,
      });
    });
  });
});
