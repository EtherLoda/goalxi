import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InjuryRecoveryService } from './injury-recovery.service';
import { LOGGER_SERVICE_PROVIDER } from '../test-utils/test-logger';
import {
  PlayerEntity,
  InjuryEntity,
  StaffEntity,
  TeamEntity,
  StaffRole,
  Uuid,
} from '@goalxi/database';
import { NotificationService } from '../notification/notification.service';

describe('InjuryRecoveryService', () => {
  let service: InjuryRecoveryService;
  let playerRepo: jest.Mocked<Repository<PlayerEntity>>;
  let injuryRepo: jest.Mocked<Repository<InjuryEntity>>;
  let staffRepo: jest.Mocked<Repository<StaffEntity>>;
  let notificationService: { create: jest.Mock };

  const mockPlayerRepo = { find: jest.fn(), save: jest.fn() };
  const mockInjuryRepo = { find: jest.fn(), save: jest.fn() };
  const mockStaffRepo = { find: jest.fn() };
  const mockNotificationService = { create: jest.fn() };

  const buildPlayer = (
    overrides: Partial<PlayerEntity> = {},
  ): PlayerEntity =>
    ({
      id: 1,
      name: 'Player',
      teamId: 'team-1' as Uuid,
      currentInjuryValue: 10,
      injuryType: 'muscle',
      injuryState: 'major',
      injuredAt: new Date(),
      fractionalAge: 0,
      // The `getExactAge` helper used by the service is a method on
      // the entity 鈥?give it a stub that returns a small age.
      getExactAge: () => [24, 30] as [number, number],
      team: {
        id: 'team-1' as Uuid,
        name: 'Team One',
        isBot: false,
        userId: 'user-1' as Uuid,
      } as unknown as TeamEntity,
      ...overrides,
    }) as unknown as PlayerEntity;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InjuryRecoveryService,
        LOGGER_SERVICE_PROVIDER,
        { provide: getRepositoryToken(PlayerEntity), useValue: mockPlayerRepo },
        { provide: getRepositoryToken(InjuryEntity), useValue: mockInjuryRepo },
        { provide: getRepositoryToken(StaffEntity), useValue: mockStaffRepo },
        { provide: getRepositoryToken(TeamEntity), useValue: {} },
        { provide: NotificationService, useValue: mockNotificationService },
      ],
    }).compile();

    service = module.get<InjuryRecoveryService>(InjuryRecoveryService);
    playerRepo = module.get(getRepositoryToken(PlayerEntity));
    injuryRepo = module.get(getRepositoryToken(InjuryEntity));
    staffRepo = module.get(getRepositoryToken(StaffEntity));
    notificationService = mockNotificationService;

    jest.clearAllMocks();
  });

  describe('processDailyInjuryRecovery', () => {
    it('returns early after one query when there are no injured players', async () => {
      mockPlayerRepo.find.mockResolvedValueOnce([]);

      await service.processDailyInjuryRecovery();

      // Single query for injured players; nothing else.
      expect(mockPlayerRepo.find).toHaveBeenCalledTimes(1);
      expect(mockStaffRepo.find).not.toHaveBeenCalled();
      expect(mockInjuryRepo.find).not.toHaveBeenCalled();
      expect(mockPlayerRepo.save).not.toHaveBeenCalled();
      expect(notificationService.create).not.toHaveBeenCalled();
    });

    it('skips bot-team players without querying for their team doctor', async () => {
      const botPlayer = buildPlayer({
        id: 2,
        teamId: 'bot-team' as Uuid,
        team: {
          id: 'bot-team' as Uuid,
          name: 'Bot FC',
          isBot: true,
          userId: null,
        } as unknown as TeamEntity,
      });
      mockPlayerRepo.find.mockResolvedValueOnce([botPlayer]);

      await service.processDailyInjuryRecovery();

      // The bot player was filtered out, so no doctor fetch, no save.
      expect(mockStaffRepo.find).not.toHaveBeenCalled();
      expect(mockPlayerRepo.save).not.toHaveBeenCalled();
    });

    it('decrements currentInjuryValue for a non-bot player and saves them in a single batched call', async () => {
      const player = buildPlayer({ id: 10, currentInjuryValue: 50 });
      mockPlayerRepo.find.mockResolvedValueOnce([player]);
      mockStaffRepo.find.mockResolvedValueOnce([
        { teamId: 'team-1' as Uuid, level: 2 } as unknown as StaffEntity,
      ]);

      await service.processDailyInjuryRecovery();

      // The player's injury was decremented (deterministic formula
      // in @goalxi/database 鈥?exact value not asserted, just that
      // the value moved).
      expect(player.currentInjuryValue).toBeLessThan(50);
      // Doctor lookup used the pre-built map, not a per-player find.
      expect(mockStaffRepo.find).toHaveBeenCalledTimes(1);
      // All dirty players saved in one batch.
      expect(mockPlayerRepo.save).toHaveBeenCalledTimes(1);
      expect(mockPlayerRepo.save).toHaveBeenCalledWith([player]);
      // No recoveries 鈫?no second save, no notification, no injuryRepo work.
      expect(mockInjuryRepo.find).not.toHaveBeenCalled();
      expect(notificationService.create).not.toHaveBeenCalled();
    });

    it('on full recovery, stamps recoveredAt, clears injury fields, and notifies the team manager', async () => {
      const player = buildPlayer({ id: 20, currentInjuryValue: 1 });
      // After one recovery tick the value drops to 0 鈫?"fully recovered".
      mockPlayerRepo.find
        .mockResolvedValueOnce([player]) // 1: injured + team
        .mockResolvedValueOnce([player]); // 2: recovered + team (for notification)
      mockStaffRepo.find.mockResolvedValueOnce([
        { teamId: 'team-1' as Uuid, level: 0 } as unknown as StaffEntity,
      ]);

      const activeInjury = {
        playerId: 20,
        injuryType: 'muscle',
        occurredAt: new Date(),
        recoveredAt: null,
      } as InjuryEntity;
      mockInjuryRepo.find.mockResolvedValueOnce([activeInjury]);
      mockInjuryRepo.save.mockResolvedValueOnce([activeInjury]);
      mockPlayerRepo.save.mockResolvedValueOnce(undefined);

      await service.processDailyInjuryRecovery();

      // The injury was stamped.
      expect(activeInjury.recoveredAt).toBeInstanceOf(Date);
      expect(mockInjuryRepo.save).toHaveBeenCalledWith([activeInjury]);

      // The player record had its injury fields cleared.
      expect(player.injuryType).toBeNull();
      expect(player.injuryState).toBeNull();
      expect(player.injuredAt).toBeNull();

      // Two saves: the daily decrement batch, then the recovery-clear batch.
      expect(mockPlayerRepo.save).toHaveBeenCalledTimes(2);

      // Notification went out to the team's userId.
      expect(notificationService.create).toHaveBeenCalledTimes(1);
      expect(notificationService.create).toHaveBeenCalledWith(
        'user-1',
        'PLAYER_RECOVERED',
        'notification.playerRecovered',
        expect.objectContaining({ playerId: 20, injuryType: 'muscle' }),
      );
    });

    it('runs a fixed 4-query budget regardless of injured/recovered counts', async () => {
      // 3 injured, 2 of which fully recover.
      const players = [
        buildPlayer({ id: 1, currentInjuryValue: 1, teamId: 't1' as Uuid }),
        buildPlayer({
          id: 2,
          currentInjuryValue: 30,
          teamId: 't1' as Uuid,
          team: { id: 't1' as Uuid, name: 'T1', isBot: false, userId: 'u1' as Uuid } as unknown as TeamEntity,
        }),
        buildPlayer({ id: 3, currentInjuryValue: 1, teamId: 't2' as Uuid }),
      ];
      mockPlayerRepo.find
        .mockResolvedValueOnce(players) // 1: injured + team
        .mockResolvedValueOnce(players.filter((p) => p.currentInjuryValue === 1)); // 2: recovered + team

      mockStaffRepo.find.mockResolvedValueOnce([
        { teamId: 't1' as Uuid, role: StaffRole.TEAM_DOCTOR, level: 1 } as any,
        { teamId: 't2' as Uuid, role: StaffRole.TEAM_DOCTOR, level: 1 } as any,
      ]);

      const activeInjuries = [
        { playerId: 1, injuryType: 'muscle', recoveredAt: null } as InjuryEntity,
        { playerId: 3, injuryType: 'ligament', recoveredAt: null } as InjuryEntity,
      ];
      mockInjuryRepo.find.mockResolvedValueOnce(activeInjuries);
      mockInjuryRepo.save.mockResolvedValueOnce(activeInjuries);
      mockPlayerRepo.save.mockResolvedValue(undefined);

      await service.processDailyInjuryRecovery();

      // The 4-query budget: injured + doctors + active injuries + recovered.
      expect(mockPlayerRepo.find).toHaveBeenCalledTimes(2);
      expect(mockStaffRepo.find).toHaveBeenCalledTimes(1);
      expect(mockInjuryRepo.find).toHaveBeenCalledTimes(1);
      // Plus the 2 playerRepo.save (decrement batch + clear batch).
      expect(mockPlayerRepo.save).toHaveBeenCalledTimes(2);
      // Two notifications (one per recovered player with a team userId).
      expect(notificationService.create).toHaveBeenCalledTimes(2);
    });
  });
});




