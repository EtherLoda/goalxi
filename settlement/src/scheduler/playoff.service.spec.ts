import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PlayoffService } from './playoff.service';
import {
  GAME_SETTINGS,
  LeagueEntity,
  LeagueStandingEntity,
  MatchEntity,
  MatchStatus,
  MatchType,
} from '@goalxi/database';
import { LOGGER_SERVICE_PROVIDER } from '../test-utils/test-logger';

describe('PlayoffService', () => {
  let service: PlayoffService;
  let matchRepository: jest.Mocked<Repository<MatchEntity>>;
  let leagueRepository: jest.Mocked<Repository<LeagueEntity>>;
  let standingRepository: jest.Mocked<Repository<LeagueStandingEntity>>;

  const mockMatchRepository = {
    find: jest.fn(),
    findOne: jest.fn(),
    save: jest.fn(),
    create: jest.fn(),
    createQueryBuilder: jest.fn(),
  };

  const mockLeagueRepository = {
    find: jest.fn(),
    findOne: jest.fn(),
  };

  const mockStandingRepository = {
    find: jest.fn(),
    findOne: jest.fn(),
  };

  // Pyramid fixtures (1 + 4 + 16 + 64).
  const TIER1: Partial<LeagueEntity> = {
    id: 'tier1-id' as any,
    name: 'Tier 1',
    tier: 1,
    tierDivision: 1,
    maxTeams: 16,
    promotionSlots: 0,
    playoffSlots: 4,
    relegationSlots: 4,
    parentLeagueId: null as any,
  };

  const TIER2_D1: Partial<LeagueEntity> = {
    id: 'tier2-d1-id' as any,
    name: 'Tier 2 D1',
    tier: 2,
    tierDivision: 1,
    maxTeams: 16,
    promotionSlots: 1,
    playoffSlots: 4,
    relegationSlots: 4,
    parentLeagueId: 'tier1-id' as any,
  };

  const TIER2_D2: Partial<LeagueEntity> = {
    id: 'tier2-d2-id' as any,
    name: 'Tier 2 D2',
    tier: 2,
    tierDivision: 2,
    maxTeams: 16,
    parentLeagueId: 'tier1-id' as any,
  };

  const TIER3_D1: Partial<LeagueEntity> = {
    id: 'tier3-d1-id' as any,
    name: 'Tier 3 D1',
    tier: 3,
    tierDivision: 1,
    maxTeams: 16,
    parentLeagueId: 'tier2-d1-id' as any,
  };

  // L2-D2's only child used in one regression.
  const TIER3_D5: Partial<LeagueEntity> = {
    id: 'tier3-d5-id' as any,
    name: 'Tier 3 D5',
    tier: 3,
    tierDivision: 5,
    maxTeams: 16,
    parentLeagueId: 'tier2-d2-id' as any,
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PlayoffService,
        LOGGER_SERVICE_PROVIDER,
        {
          provide: getRepositoryToken(MatchEntity),
          useValue: mockMatchRepository,
        },
        {
          provide: getRepositoryToken(LeagueEntity),
          useValue: mockLeagueRepository,
        },
        {
          provide: getRepositoryToken(LeagueStandingEntity),
          useValue: mockStandingRepository,
        },
      ],
    }).compile();

    service = module.get<PlayoffService>(PlayoffService);
    matchRepository = module.get(getRepositoryToken(MatchEntity));
    leagueRepository = module.get(getRepositoryToken(LeagueEntity));
    standingRepository = module.get(getRepositoryToken(LeagueStandingEntity));

    jest.clearAllMocks();
  });

  describe('generateAllPlayoffMatches', () => {
    it('returns an empty array when no tier-1 leagues exist', async () => {
      leagueRepository.find.mockResolvedValueOnce([]);
      const result = await service.generateAllPlayoffMatches(1);
      expect(result).toEqual([]);
    });

    it('emits 3 matches for a 3-tier fixture: T1↔L2-D1 upper + L2-D1↔L3-D1 lower + L2-D1↔T1 lower', async () => {
      // Minimal fixture:
      //   T1 (1 league)
      //   └── L2-D1 ──── L3-D1
      //
      // Expected emissions:
      //   (a) T1 lower-boundary: T1 #9 (home) ↔ L2-D1 #2 (away)
      //   (b) L2-D1 upper-boundary: T1 #13 (home) ↔ L2-D1 #2 (away)
      //   (c) L2-D1 lower-boundary: L2-D1 #9 (home) ↔ L3-D1 #2 (away)
      leagueRepository.find
        // (1) Top-of-pyramid T1 walk.
        .mockResolvedValueOnce([TIER1 as LeagueEntity])
        // (2) T1's children (L2-D1 only).
        .mockResolvedValueOnce([TIER2_D1 as LeagueEntity])
        // (3) L2-D1's children (L3-D1 only).
        .mockResolvedValueOnce([TIER3_D1 as LeagueEntity])
        // (4) L3-D1's children — none.
        .mockResolvedValueOnce([]);

      const t1Standings = [
        { teamId: 't1-9', position: 9, team: { id: 't1-9', name: 'T1-9' } },
        { teamId: 't1-13', position: 13, team: { id: 't1-13', name: 'T1-13' } },
      ];
      const l2d1Standings = [
        { teamId: 'l2d1-2', position: 2, team: { id: 'l2d1-2', name: 'A' } },
        { teamId: 'l2d1-9', position: 9, team: { id: 'l2d1-9', name: 'B' } },
      ];
      const l3d1Standing2 = {
        teamId: 'l3d1-2',
        position: 2,
        team: { id: 'l3d1-2', name: 'E' },
      };

      // standings.find order: T1 first, then L2-D1.
      mockStandingRepository.find
        .mockResolvedValueOnce(t1Standings as any)
        .mockResolvedValueOnce(l2d1Standings as any);

      // leagueRepository.findOne call order:
      //   T1 upper-boundary:           (1) tier 0 lookup → null
      //   L2-D1 upper-boundary:        (2) tier 1 div 1 lookup → TIER1
      //   L3-D1 upper-boundary:        (3) tier 2 div 1 lookup → null
      //   (no more upper-boundary lookups in this fixture)
      mockLeagueRepository.findOne
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(TIER1 as LeagueEntity)
        .mockResolvedValueOnce(null);
      // standings.findOne call order (4 calls total):
      //   T1 lower-boundary:       (1) L2-D1 #2 → l2d1-2
      //   L2-D1 upper-boundary:     (2) L2-D1 #2 → l2d1-2
      //                           (3) T1 #13 → t1-13
      //   L2-D1 lower-boundary:     (4) L3-D1 #2 → l3d1Standing2
      const findOneQueue: any[] = [
        { teamId: 'l2d1-2', position: 2, team: { id: 'l2d1-2', name: 'A' } }, // (1)
        { teamId: 'l2d1-2', position: 2, team: { id: 'l2d1-2', name: 'A' } }, // (2)
        { teamId: 't1-13', position: 13, team: { id: 't1-13', name: 'T1-13' } }, // (3)
        l3d1Standing2, // (4)
      ];
      let findOneIdx = 0;
      mockStandingRepository.findOne.mockImplementation(async (opts: any) => {
        const ret = findOneIdx < findOneQueue.length
          ? findOneQueue[findOneIdx++]
          : undefined;
        return ret;
      });

      mockMatchRepository.create.mockImplementation(
        (data) => data as MatchEntity,
      );
      mockMatchRepository.save.mockImplementation((data) =>
        Promise.resolve(data as MatchEntity[]),
      );

      const result = await service.generateAllPlayoffMatches(1);

      expect(result).toHaveLength(3);

      // (a) T1 lower-boundary: T1 #9 (home) vs L2-D1 #2 (away)
      const t1Lower = result.find(
        (m) =>
          m.homeLeagueId === 'tier1-id' &&
          m.homeTeamId === 't1-9' &&
          m.awayTeamId === 'l2d1-2',
      );
      expect(t1Lower).toMatchObject({
        homeLeagueId: 'tier1-id',
        awayLeagueId: 'tier2-d1-id',
        week: 16,
      });

      // (b) L2-D1 upper-boundary: T1 #13 (home) vs L2-D1 #2 (away)
      const l2d1Upper = result.find(
        (m) =>
          m.homeLeagueId === 'tier1-id' &&
          m.homeTeamId === 't1-13' &&
          m.awayTeamId === 'l2d1-2',
      );
      expect(l2d1Upper).toMatchObject({
        homeLeagueId: 'tier1-id',
        awayLeagueId: 'tier2-d1-id',
        week: 16,
      });

      // (c) L2-D1 lower-boundary: L2-D1 #9 (home) vs L3-D1 #2 (away)
      const l2d1Lower = result.find(
        (m) =>
          m.homeLeagueId === 'tier2-d1-id' &&
          m.homeTeamId === 'l2d1-9' &&
          m.awayTeamId === 'l3d1-2',
      );
      expect(l2d1Lower).toMatchObject({
        homeLeagueId: 'tier2-d1-id',
        awayLeagueId: 'tier3-d1-id',
        week: 16,
      });
    });

    it('does not pair a league with another tier branch that shares its tier but not its parent', async () => {
      // L2-D2 (the only tier-2 league in this fixture) has
      // no children returned by the `parentLeagueId` filter
      // (L3-D1 belongs to L2-D1, not L2-D2). L2-D2's parent
      // lookup (tier=1, tierDivision=2) returns null (L1
      // has only tierDivision=1), so L2-D2 has no upper
      // boundary either. Total: 0 matches.
      leagueRepository.find
        .mockResolvedValueOnce([TIER1 as LeagueEntity])
        .mockResolvedValueOnce([TIER2_D2 as LeagueEntity])
        .mockResolvedValueOnce([]);

      mockStandingRepository.find.mockResolvedValue([] as any);
      mockStandingRepository.findOne.mockResolvedValue(null);
      mockMatchRepository.create.mockImplementation(
        (data) => data as MatchEntity,
      );
      mockMatchRepository.save.mockImplementation((data) =>
        Promise.resolve(data as MatchEntity[]),
      );

      const result = await service.generateAllPlayoffMatches(1);

      expect(result).toEqual([]);
    });
  });

  describe('getNextPlayoffDate', () => {
    it('returns the next Wednesday at MATCH_KICKOFF_HOUR_UTC, day-aligned to UTC', () => {
      const fixedNow = new Date('2026-04-12T00:00:00.000Z'); // Sunday
      jest.useFakeTimers().setSystemTime(fixedNow);

      const getNextPlayoffDate = (service as any).getNextPlayoffDate.bind(
        service,
      );
      const result = getNextPlayoffDate() as Date;

      expect(result.getUTCDay()).toBe(3); // Wednesday (UTC)
      expect(result.toISOString()).toBe(
        `2026-04-15T${String(GAME_SETTINGS.MATCH_KICKOFF_HOUR_UTC).padStart(2, '0')}:00:00.000Z`,
      );
      expect(result.getUTCHours()).toBe(GAME_SETTINGS.MATCH_KICKOFF_HOUR_UTC);

      jest.useRealTimers();
    });

    it('always pushes at least 7 days when today is already a Wednesday', () => {
      const fixedNow = new Date('2026-04-08T12:00:00.000Z');
      jest.useFakeTimers().setSystemTime(fixedNow);

      const getNextPlayoffDate = (service as any).getNextPlayoffDate.bind(
        service,
      );
      const result = getNextPlayoffDate() as Date;

      expect(result.getUTCDate()).toBe(15);

      jest.useRealTimers();
    });
  });
});
