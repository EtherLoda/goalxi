import { CupService } from './cup.service';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import {
  CupBracketSlotEntity,
  CupEntity,
  CupRoundEntity,
  TeamEntity,
  type Uuid,
} from '@goalxi/database';
import { NotFoundException } from '@nestjs/common';

/**
 * Smoke spec for the cup API service. The interesting logic
 * lives in `findBracket` (slot pairing + team batch fetch),
 * so we focus the cases there. The other endpoints are
 * thin pass-throughs to the repository.
 */
describe('CupService', () => {
  let service: CupService;
  let cupRepo: { findOne: jest.Mock; createQueryBuilder: jest.Mock };
  let roundRepo: { find: jest.Mock };
  let slotRepo: { find: jest.Mock };
  let teamRepo: { find: jest.Mock };

  beforeEach(async () => {
    cupRepo = {
      findOne: jest.fn(),
      createQueryBuilder: jest.fn(() => ({
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([]),
      })),
    };
    roundRepo = { find: jest.fn() };
    slotRepo = { find: jest.fn() };
    teamRepo = { find: jest.fn() };
    const module = await Test.createTestingModule({
      providers: [
        CupService,
        { provide: getRepositoryToken(CupEntity), useValue: cupRepo },
        { provide: getRepositoryToken(CupRoundEntity), useValue: roundRepo },
        { provide: getRepositoryToken(CupBracketSlotEntity), useValue: slotRepo },
        { provide: getRepositoryToken(TeamEntity), useValue: teamRepo },
      ],
    }).compile();
    service = module.get(CupService);
  });

  describe('findOne', () => {
    it('throws NotFoundException when the cup is missing', async () => {
      cupRepo.findOne.mockResolvedValue(null);
      await expect(service.findOne('missing' as Uuid)).rejects.toThrow(NotFoundException);
    });

    it('returns the cup when found', async () => {
      const cup = {
        id: 'cup-1' as Uuid,
        season: 1,
        type: 'NATIONAL',
        name: 'National Cup 1',
        status: 'in_progress',
        prizeCurrency: 'CNY',
        prizePool: '0',
        createdAt: new Date('2026-09-01T00:00:00Z'),
        updatedAt: new Date('2026-09-01T00:00:00Z'),
      } as CupEntity;
      cupRepo.findOne.mockResolvedValue(cup);
      const result = await service.findOne('cup-1' as Uuid);
      expect(result.id).toBe('cup-1');
      expect(result.season).toBe(1);
    });
  });

  describe('findBracket', () => {
    // A standard cup mock with createdAt/updatedAt populated
    // several bracket tests below need a real cup to round-trip
    // through `toResDto`, which calls `cup.createdAt.toISOString()`.
    const buildCup = (): CupEntity =>
      ({
        id: 'cup-1' as Uuid,
        season: 1,
        type: 'NATIONAL',
        name: 'National Cup 1',
        status: 'in_progress',
        prizeCurrency: 'CNY',
        prizePool: '0',
        createdAt: new Date('2026-09-01T00:00:00Z'),
        updatedAt: new Date('2026-09-01T00:00:00Z'),
      } as CupEntity);

    it('returns the cup + 0 rounds when the cup has no rounds yet', async () => {
      const cup = buildCup();
      cupRepo.findOne.mockResolvedValue(cup);
      roundRepo.find.mockResolvedValue([]);
      slotRepo.find.mockResolvedValue([]);

      const bracket = await service.findBracket('cup-1' as Uuid);
      expect(bracket.cup.id).toBe('cup-1');
      expect(bracket.rounds).toEqual([]);
    });

    it('pairs 2 slots into 1 match (non-bye case)', async () => {
      const cup = buildCup();
      const round = {
        id: 'round-1' as Uuid,
        cupId: 'cup-1' as Uuid,
        roundNumber: 0,
        roundName: 'Pre-Qualifying',
        kind: 'qualifying',
        status: 'in_progress',
        scheduledAt: new Date('2026-09-16T06:00:00Z'),
        slotCount: 2,
      } as CupRoundEntity;
      const slots = [
        {
          id: 'slot-0' as Uuid,
          cupId: 'cup-1' as Uuid,
          roundId: 'round-1' as Uuid,
          roundNumber: 0,
          slotIndex: 0,
          homeTeamId: 'team-A' as Uuid,
          awayTeamId: null,
          matchId: 'match-1' as Uuid,
          winnerTeamId: null,
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
          matchId: 'match-1' as Uuid,
          winnerTeamId: null,
          isBye: false,
        } as CupBracketSlotEntity,
      ];
      const teams = [
        { id: 'team-A' as Uuid, name: 'Team A' } as TeamEntity,
        { id: 'team-B' as Uuid, name: 'Team B' } as TeamEntity,
      ];
      cupRepo.findOne.mockResolvedValue(cup);
      roundRepo.find.mockResolvedValue([round]);
      slotRepo.find.mockResolvedValue(slots);
      teamRepo.find.mockResolvedValue(teams);

      const bracket = await service.findBracket('cup-1' as Uuid);
      expect(bracket.rounds).toHaveLength(1);
      const matches = bracket.rounds[0].matches;
      expect(matches).toHaveLength(1);
      expect(matches[0].matchId).toBe('match-1');
      expect(matches[0].homeTeam?.id).toBe('team-A');
      expect(matches[0].awayTeam?.id).toBe('team-B');
    });

    it('skips the second-slot perspective of the same match', async () => {
      const cup = buildCup();
      const round = {
        id: 'round-1' as Uuid,
        cupId: 'cup-1' as Uuid,
        roundNumber: 0,
        kind: 'qualifying',
        status: 'in_progress',
        scheduledAt: null,
        slotCount: 2,
      } as CupRoundEntity;
      // 4 slots = 2 matches. Each match has 2 perspective slots.
      const slots = [
        { id: 's0' as Uuid, cupId: 'cup-1' as Uuid, roundId: 'round-1' as Uuid, roundNumber: 0, slotIndex: 0, homeTeamId: 'tA' as Uuid, awayTeamId: null, matchId: 'm1' as Uuid, winnerTeamId: null, isBye: false } as CupBracketSlotEntity,
        { id: 's1' as Uuid, cupId: 'cup-1' as Uuid, roundId: 'round-1' as Uuid, roundNumber: 0, slotIndex: 1, homeTeamId: null, awayTeamId: 'tB' as Uuid, matchId: 'm1' as Uuid, winnerTeamId: null, isBye: false } as CupBracketSlotEntity,
        { id: 's2' as Uuid, cupId: 'cup-1' as Uuid, roundId: 'round-1' as Uuid, roundNumber: 0, slotIndex: 2, homeTeamId: 'tC' as Uuid, awayTeamId: null, matchId: 'm2' as Uuid, winnerTeamId: null, isBye: false } as CupBracketSlotEntity,
        { id: 's3' as Uuid, cupId: 'cup-1' as Uuid, roundId: 'round-1' as Uuid, roundNumber: 0, slotIndex: 3, homeTeamId: null, awayTeamId: 'tD' as Uuid, matchId: 'm2' as Uuid, winnerTeamId: null, isBye: false } as CupBracketSlotEntity,
      ];
      const teams = [
        { id: 'tA' as Uuid, name: 'TA' } as TeamEntity,
        { id: 'tB' as Uuid, name: 'TB' } as TeamEntity,
        { id: 'tC' as Uuid, name: 'TC' } as TeamEntity,
        { id: 'tD' as Uuid, name: 'TD' } as TeamEntity,
      ];
      cupRepo.findOne.mockResolvedValue(cup);
      roundRepo.find.mockResolvedValue([round]);
      slotRepo.find.mockResolvedValue(slots);
      teamRepo.find.mockResolvedValue(teams);

      const bracket = await service.findBracket('cup-1' as Uuid);
      // 2 matches (one per matchId), not 4 (which would mean
      // we double-counted the away-perspective slots).
      expect(bracket.rounds[0].matches).toHaveLength(2);
    });

    it('renders a bye as a single-slot match with isBye=true', async () => {
      const cup = buildCup();
      const round = {
        id: 'round-1' as Uuid,
        cupId: 'cup-1' as Uuid,
        roundNumber: 0,
        kind: 'qualifying',
        status: 'in_progress',
        scheduledAt: null,
        slotCount: 1,
      } as CupRoundEntity;
      // 1 slot = bye (no matchId, isBye=true)
      const slots = [
        {
          id: 's0' as Uuid,
          cupId: 'cup-1' as Uuid,
          roundId: 'round-1' as Uuid,
          roundNumber: 0,
          slotIndex: 0,
          homeTeamId: 'team-X' as Uuid,
          awayTeamId: null,
          matchId: null,
          winnerTeamId: 'team-X' as Uuid,
          isBye: true,
        } as CupBracketSlotEntity,
      ];
      const teams = [{ id: 'team-X' as Uuid, name: 'Team X' } as TeamEntity];
      cupRepo.findOne.mockResolvedValue(cup);
      roundRepo.find.mockResolvedValue([round]);
      slotRepo.find.mockResolvedValue(slots);
      teamRepo.find.mockResolvedValue(teams);

      const bracket = await service.findBracket('cup-1' as Uuid);
      const matches = bracket.rounds[0].matches;
      expect(matches).toHaveLength(1);
      expect(matches[0].isBye).toBe(true);
      expect(matches[0].homeTeam?.id).toBe('team-X');
      expect(matches[0].awayTeam).toBeNull();
      expect(matches[0].winnerTeamId).toBe('team-X');
    });
  });
});
