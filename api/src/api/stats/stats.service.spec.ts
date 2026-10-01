import {
  LeagueEntity,
  MatchEntity,
  MatchEventEntity,
  MatchStatus,
  MatchTeamStatsEntity,
  PlayerCompetitionStatsEntity,
  PlayerEntity,
  TeamEntity,
} from '@goalxi/database';
import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { StatsService } from './stats.service';

describe('StatsService', () => {
  let service: StatsService;
  let module: TestingModule; // hoisted so nested describes can use module.get
  let matchRepository: Repository<MatchEntity>;
  let matchStatsRepository: Repository<MatchTeamStatsEntity>;
  let teamRepository: Repository<TeamEntity>;
  let eventRepository: Repository<MatchEventEntity>;

  const mockMatch = {
    id: 'match-1',
    homeTeamId: 'team-1',
    awayTeamId: 'team-2',
    homeScore: 2,
    awayScore: 1,
    status: MatchStatus.COMPLETED,
    season: 1,
  };

  const mockTeam = {
    id: 'team-1',
    name: 'Team 1',
  };

  const mockStats = [
    {
      matchId: 'match-1',
      teamId: 'team-1',
      possession: 60,
      shots: 10,
      goals: 2,
    },
    {
      matchId: 'match-1',
      teamId: 'team-2',
      possession: 40,
      shots: 5,
      goals: 1,
    },
  ];

  beforeEach(async () => {
    module = await Test.createTestingModule({
      providers: [
        StatsService,
        {
          provide: getRepositoryToken(MatchEntity),
          useValue: {
            findOne: jest.fn(),
            find: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(MatchTeamStatsEntity),
          useValue: {
            find: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(MatchEventEntity),
          useValue: {
            find: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(TeamEntity),
          useValue: {
            findOne: jest.fn(),
            find: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(LeagueEntity),
          useValue: {
            find: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(PlayerCompetitionStatsEntity),
          useValue: {
            find: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(PlayerEntity),
          useValue: {
            findOne: jest.fn(),
            find: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<StatsService>(StatsService);
    matchRepository = module.get<Repository<MatchEntity>>(
      getRepositoryToken(MatchEntity),
    );
    matchStatsRepository = module.get<Repository<MatchTeamStatsEntity>>(
      getRepositoryToken(MatchTeamStatsEntity),
    );
    teamRepository = module.get<Repository<TeamEntity>>(
      getRepositoryToken(TeamEntity),
    );
    eventRepository = module.get<Repository<MatchEventEntity>>(
      getRepositoryToken(MatchEventEntity),
    );
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getMatchStats', () => {
    it('should return match stats', async () => {
      jest
        .spyOn(matchRepository, 'findOne')
        .mockResolvedValue(mockMatch as any);
      jest
        .spyOn(matchStatsRepository, 'find')
        .mockResolvedValue(mockStats as any);
      jest.spyOn(eventRepository, 'find').mockResolvedValue([] as any);

      const result = await service.getMatchStats('match-1');

      expect(result.matchId).toBe('match-1');
      expect(result.homeTeamStats).toBeDefined();
      expect(result.awayTeamStats).toBeDefined();
    });

    it('should throw NotFoundException if match not found', async () => {
      jest.spyOn(matchRepository, 'findOne').mockResolvedValue(null);
      jest.spyOn(eventRepository, 'find').mockResolvedValue([] as any);

      await expect(service.getMatchStats('invalid')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should return zeroed stats for a scheduled (not yet started) match', async () => {
      jest.spyOn(matchRepository, 'findOne').mockResolvedValue({
        ...mockMatch,
        status: MatchStatus.SCHEDULED,
      } as any);
      jest.spyOn(eventRepository, 'find').mockResolvedValue([] as any);

      const result = await service.getMatchStats('match-1');

      expect(result.matchId).toBe('match-1');
      expect(result.homeTeamStats).toBeDefined();
      expect(result.awayTeamStats).toBeDefined();
      expect(result.homeComputed).toEqual({
        xG: 0,
        goals: 0,
        saves: 0,
        tackles: 0,
        interceptions: 0,
        clearances: 0,
        passAccuracy: 0,
      });
      expect(result.awayComputed).toEqual({
        xG: 0,
        goals: 0,
        saves: 0,
        tackles: 0,
        interceptions: 0,
        clearances: 0,
        passAccuracy: 0,
      });
      // Make sure we didn't touch the DB for stats/events on a not-yet-started match
      expect(matchStatsRepository.find).not.toHaveBeenCalled();
      expect(eventRepository.find).not.toHaveBeenCalled();
    });
  });

  describe('getTeamSeasonStats', () => {
    it('should calculate team season stats correctly', async () => {
      jest.spyOn(teamRepository, 'findOne').mockResolvedValue(mockTeam as any);
      jest.spyOn(matchRepository, 'find').mockResolvedValue([
        {
          ...mockMatch,
          homeTeamId: 'team-1',
          awayTeamId: 'team-2',
          homeScore: 2,
          awayScore: 1,
        }, // Win
        {
          ...mockMatch,
          homeTeamId: 'team-2',
          awayTeamId: 'team-1',
          homeScore: 1,
          awayScore: 1,
        }, // Draw
        {
          ...mockMatch,
          homeTeamId: 'team-1',
          awayTeamId: 'team-3',
          homeScore: 0,
          awayScore: 1,
        }, // Loss
      ] as any);

      const result = await service.getTeamSeasonStats('team-1', 1);

      expect(result.matchesPlayed).toBe(3);
      expect(result.wins).toBe(1);
      expect(result.draws).toBe(1);
      expect(result.losses).toBe(1);
      expect(result.goalsFor).toBe(3); // 2 + 1 + 0
      expect(result.goalsAgainst).toBe(3); // 1 + 1 + 1
      expect(result.points).toBe(4); // 3 + 1 + 0
    });

    it('should throw NotFoundException if team not found', async () => {
      jest.spyOn(teamRepository, 'findOne').mockResolvedValue(null);

      await expect(service.getTeamSeasonStats('invalid', 1)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('getPlayerSeasonStats', () => {
    const playerId = 42;
    const playerIdStr = '42';

    const getLeagueRepo = () =>
      module.get<Repository<LeagueEntity>>(getRepositoryToken(LeagueEntity));
    const getPlayerRepo = () =>
      module.get<Repository<PlayerEntity>>(getRepositoryToken(PlayerEntity));
    const getCompStatsRepo = () =>
      module.get<Repository<PlayerCompetitionStatsEntity>>(
        getRepositoryToken(PlayerCompetitionStatsEntity),
      );

    it('throws NotFoundException for a non-numeric id', async () => {
      await expect(
        service.getPlayerSeasonStats('not-a-number'),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException when the player does not exist', async () => {
      jest.spyOn(getPlayerRepo(), 'findOne').mockResolvedValue(null as any);
      await expect(service.getPlayerSeasonStats(playerIdStr)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('returns career totals + per-season rows sorted DESC by season', async () => {
      // Two league rows for season 2, one league row for season 1.
      // The career totals are the sum of all three.
      jest.spyOn(getPlayerRepo(), 'findOne').mockResolvedValue({
        id: playerId,
        name: 'Alice',
        teamId: 'team-1', // current team - the FE labels every
        // per-season row with this teamId because the stats
        // table doesn't track per-season team membership.
      } as any);
      // Single-row lookup for the current team (the bulk `find`
      // call that the old fanout used is gone - the service now
      // resolves one teamId at a time).
      jest.spyOn(teamRepository, 'findOne').mockResolvedValue({
        id: 'team-1',
        name: 'United',
      } as any);
      jest.spyOn(getCompStatsRepo(), 'find').mockResolvedValue([
        {
          playerId,
          teamId: 'team-1',
          leagueId: 'league-1',
          competitionType: 'LEAGUE',
          season: 2,
          goals: 5,
          assists: 3,
          tackles: 7,
          yellowCards: 2,
          redCards: 0,
          starts: 10,
          appearances: 12,
          substituteAppearances: 2,
        },
        {
          playerId,
          teamId: 'team-2',
          leagueId: 'league-2',
          competitionType: 'LEAGUE',
          season: 2,
          goals: 1,
          assists: 2,
          tackles: 1,
          yellowCards: 0,
          redCards: 1,
          starts: 5,
          appearances: 8,
          substituteAppearances: 3,
        },
        {
          playerId,
          teamId: 'team-1',
          leagueId: 'league-1',
          competitionType: 'LEAGUE',
          season: 1,
          goals: 2,
          assists: 0,
          tackles: 3,
          yellowCards: 1,
          redCards: 0,
          starts: 4,
          appearances: 4,
          substituteAppearances: 0,
        },
      ] as any);
      jest.spyOn(teamRepository, 'find').mockResolvedValue([
        { id: 'team-1', name: 'United' },
        { id: 'team-2', name: 'City' },
      ] as any);
      jest.spyOn(getLeagueRepo(), 'find').mockResolvedValue([
        { id: 'league-1', name: 'Premier' },
        { id: 'league-2', name: 'Championship' },
      ] as any);

      const out = await service.getPlayerSeasonStats(playerIdStr);

      expect(out.playerId).toBe(playerId);
      expect(out.playerName).toBe('Alice');
      // Sorted by season DESC: season-2 rows first, then season-1.
      expect(out.seasons.map((s) => s.season)).toEqual([2, 2, 1]);
      // Team + league names are resolved (no N+1 fanout in the FE).
      expect(out.seasons[0]).toMatchObject({
        teamName: 'United',
        leagueName: 'Premier',
        season: 2,
        goals: 5,
        assists: 3,
        tackles: 7,
        starts: 10,
        appearances: 12,
        substituteAppearances: 2,
        yellowCards: 2,
        redCards: 0,
      });
      // Career totals are the sum across every row (one per
      // (league, season)).
      expect(out.career).toEqual({
        goals: 8, // 5 + 1 + 2
        assists: 5, // 3 + 2 + 0
        tackles: 11, // 7 + 1 + 3
        yellowCards: 3, // 2 + 0 + 1
        redCards: 1, // 0 + 1 + 0
        appearances: 24, // 12 + 8 + 4
        starts: 19, // 10 + 5 + 4
        substituteAppearances: 5, // 2 + 3 + 0
        seasonsPlayed: 3,
      });
    });

    it('surfaces cup / youth rows with leagueId = null and skips the league repo query', async () => {
      // Migration 1736000000000 made league_id nullable so cup /
      // youth matches land here. The FE renders leagueName=null
      // as "Cup" / "Youth" - the DTO leaves the label choice to
      // the client because a single project can have both a Cup
      // competition and Youth leagues (different seasonKey shape).
      jest.spyOn(getPlayerRepo(), 'findOne').mockResolvedValue({
        id: playerId,
        name: 'Bob',
      } as any);
      jest.spyOn(getCompStatsRepo(), 'find').mockResolvedValue([
        {
          playerId,
          teamId: 'team-1',
          leagueId: null, // cup match
          competitionType: 'CUP',
          season: 1,
          goals: 3,
          assists: 1,
          tackles: 2,
          yellowCards: 0,
          redCards: 0,
          starts: 4,
          appearances: 4,
          substituteAppearances: 0,
        },
      ] as any);
      jest
        .spyOn(teamRepository, 'find')
        .mockResolvedValue([{ id: 'team-1', name: 'United' }] as any);
      // No league ids to look up - the league repo should not be
      // queried at all (avoids needless round trip for cup rows).
      const leagueFindSpy = jest
        .spyOn(getLeagueRepo(), 'find')
        .mockResolvedValue([] as any);

      const out = await service.getPlayerSeasonStats(playerIdStr);

      expect(out.seasons).toHaveLength(1);
      expect(out.seasons[0].leagueId).toBeNull();
      expect(out.seasons[0].leagueName).toBeNull();
      // The competition-type discriminator rides along
      // with the row — cup rows surface as CUP, not
      // LEAGUE fallback. See migration 1737000000000.
      expect(out.seasons[0].competitionType).toBe('CUP');
      expect(out.career.goals).toBe(3);
      expect(leagueFindSpy).not.toHaveBeenCalled();
    });

    it('returns zeroed career + empty seasons when the player has no stats yet', async () => {
      jest.spyOn(getPlayerRepo(), 'findOne').mockResolvedValue({
        id: playerId,
        name: 'Carol',
      } as any);
      jest.spyOn(getCompStatsRepo(), 'find').mockResolvedValue([] as any);
      jest.spyOn(teamRepository, 'find').mockResolvedValue([] as any);
      jest.spyOn(getLeagueRepo(), 'find').mockResolvedValue([] as any);

      const out = await service.getPlayerSeasonStats(playerIdStr);

      expect(out.playerId).toBe(playerId);
      expect(out.seasons).toEqual([]);
      expect(out.career).toEqual({
        goals: 0,
        assists: 0,
        tackles: 0,
        yellowCards: 0,
        redCards: 0,
        appearances: 0,
        starts: 0,
        substituteAppearances: 0,
        seasonsPlayed: 0,
      });
    });
  });
});
