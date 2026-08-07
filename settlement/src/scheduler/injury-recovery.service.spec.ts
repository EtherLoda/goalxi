import { Test, TestingModule } from '@nestjs/testing';
import { getDataSourceToken, getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import {
  InjuryRecoveryService,
  _resetInjuryRecoveryDedupForTests,
} from './injury-recovery.service';
import { LOGGER_SERVICE_PROVIDER } from '../test-utils/test-logger';
import {
  PlayerEntity,
  StaffEntity,
  InjuryEntity,
  TeamEntity,
  StaffRole,
  Uuid,
} from '@goalxi/database';
import { NotificationService } from '../notification/notification.service';

describe('InjuryRecoveryService', () => {
  let service: InjuryRecoveryService;
  let playerRepo: jest.Mocked<Repository<PlayerEntity>>;
  let staffRepo: jest.Mocked<Repository<StaffEntity>>;
  let dataSource: jest.Mocked<DataSource>;
  let notificationService: { create: jest.Mock };

  // The shared helper `applyDailyInjuryRecovery` lives in
  // `@goalxi/database` and runs inside the DataSource mock's
  // transaction callback. The spec wires the DataSource mock so
  // the callback receives a manager backed by the same mock repos
  // — i.e. the helper's writes hit our assertions, not a real DB.
  const playerRepoMock = { find: jest.fn(), save: jest.fn() };
  const staffRepoMock = { find: jest.fn() };
  const dataSourceMock = {
    transaction: jest.fn(async (cb: any) =>
      cb({
        getRepository: (entity: any) => {
          if (entity === PlayerEntity) return playerRepoMock;
          if (entity === StaffEntity) return staffRepoMock;
          if (entity === InjuryEntity) {
            // The shared recovery helper looks up the active
            // injury rows for fully-recovered players. The mock
            // returns an empty list so the helper falls through
            // the "no recoveries" branch — the spec focuses on
            // the cron's orchestration, not the helper's
            // active-injury logic.
            return {
              find: jest.fn().mockResolvedValue([]),
              save: jest.fn(),
            };
          }
          // The helper also uses the player repo to batch-save
          // the dirty players (partial-recovery decrements +
          // cleared fields for fully-recovered players).
          throw new Error(`Unexpected entity in tx: ${entity?.name}`);
        },
      }),
    ),
  };
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
      // The `getExactAge` helper used by the shared recovery
      // formula is a method on the entity — give it a stub that
      // returns a small age.
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
        { provide: getDataSourceToken(), useValue: dataSourceMock },
        { provide: getRepositoryToken(PlayerEntity), useValue: playerRepoMock },
        { provide: getRepositoryToken(StaffEntity), useValue: staffRepoMock },
        { provide: NotificationService, useValue: mockNotificationService },
      ],
    }).compile();

    service = module.get<InjuryRecoveryService>(InjuryRecoveryService);
    playerRepo = module.get(getRepositoryToken(PlayerEntity));
    staffRepo = module.get(getRepositoryToken(StaffEntity));
    dataSource = module.get(getDataSourceToken());
    notificationService = mockNotificationService;

    // The dedup timestamp is module-scoped, so it leaks across
    // tests. Reset before each test so a previous successful run
    // doesn't suppress the next one.
    _resetInjuryRecoveryDedupForTests();
    jest.clearAllMocks();
  });

  describe('processDailyInjuryRecovery', () => {
    it('returns early after one query when there are no injured players', async () => {
      playerRepo.find.mockResolvedValueOnce([]);

      await service.processDailyInjuryRecovery();

      // Single query for injured players; nothing else.
      expect(playerRepo.find).toHaveBeenCalledTimes(1);
      expect(staffRepo.find).not.toHaveBeenCalled();
      expect(dataSource.transaction).not.toHaveBeenCalled();
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
      playerRepo.find.mockResolvedValueOnce([botPlayer]);

      await service.processDailyInjuryRecovery();

      // The bot player was filtered out, so no doctor fetch, no save.
      expect(staffRepo.find).not.toHaveBeenCalled();
      expect(dataSource.transaction).not.toHaveBeenCalled();
      expect(notificationService.create).not.toHaveBeenCalled();
    });

    it('opens a single transaction and sends notifications for each fully-recovered player', async () => {
      // Player with currentInjuryValue = 1: one recovery tick
      // (age 24.27, no doctor → daily ~7.5) drops them to 0, so the
      // helper reports them in `recoveries`. We don't pin the exact
      // helper output — just that the cron routes the result
      // through to `notificationService.create`.
      const player = buildPlayer({ id: 20, currentInjuryValue: 1 });
      playerRepo.find.mockResolvedValueOnce([player]);
      staffRepo.find.mockResolvedValueOnce([
        { teamId: 'team-1' as Uuid, role: StaffRole.TEAM_DOCTOR, level: 0 } as unknown as StaffEntity,
      ]);

      await service.processDailyInjuryRecovery();

      // The single transaction was opened with the player inputs.
      expect(dataSource.transaction).toHaveBeenCalledTimes(1);
      // The notification went out to the team's userId. The exact
      // payload comes from the shared helper; the cron just relays.
      expect(notificationService.create).toHaveBeenCalledTimes(1);
      expect(notificationService.create).toHaveBeenCalledWith(
        'user-1',
        'PLAYER_RECOVERED',
        'notification.playerRecovered',
        expect.objectContaining({ playerId: 20 }),
      );
    });

    it('does not open a transaction when no eligible player remains after bot filter', async () => {
      // Mix of bot + no-team players. The doctor map has to be
      // built (we know that, because... actually the cron should
      // skip the doctor query too if no eligible team remains).
      // Today: doctor query runs as long as the team is non-bot,
      // but with all players filtered, the transaction is never
      // opened. This pins the current behavior.
      const botPlayer = buildPlayer({
        id: 30,
        teamId: 'bot-team' as Uuid,
        team: {
          id: 'bot-team' as Uuid,
          name: 'Bot FC',
          isBot: true,
          userId: null,
        } as unknown as TeamEntity,
      });
      playerRepo.find.mockResolvedValueOnce([botPlayer]);

      await service.processDailyInjuryRecovery();

      // Bot-only → no doctor fetch (activeTeamIds is empty).
      expect(staffRepo.find).not.toHaveBeenCalled();
      // No eligible players → no transaction at all.
      expect(dataSource.transaction).not.toHaveBeenCalled();
      expect(notificationService.create).not.toHaveBeenCalled();
    });

    it('runs a fixed 3-query budget + 1 transaction regardless of injured/recovered counts', async () => {
      // 3 injured, all non-bot. The shared helper will mark 0
      // (currentInjuryValue = 1, drops to 0 in one tick) and 1
      // (currentInjuryValue = 1, same) as recovered; the middle
      // player (currentInjuryValue = 30) is a partial recovery.
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
      playerRepo.find.mockResolvedValueOnce(players);

      staffRepo.find.mockResolvedValueOnce([
        { teamId: 't1' as Uuid, role: StaffRole.TEAM_DOCTOR, level: 1 } as any,
        { teamId: 't2' as Uuid, role: StaffRole.TEAM_DOCTOR, level: 1 } as any,
      ]);

      await service.processDailyInjuryRecovery();

      // 3-query budget: injured + doctors + (1 transaction for the
      // shared helper, which does its own internal queries).
      expect(playerRepo.find).toHaveBeenCalledTimes(1);
      expect(staffRepo.find).toHaveBeenCalledTimes(1);
      expect(dataSource.transaction).toHaveBeenCalledTimes(1);
    });

    it('skips a second tick within the 23h dedup window (P2-#6)', async () => {
      // First tick: runs normally, no skip.
      const player = buildPlayer({ id: 50, currentInjuryValue: 30 });
      playerRepo.find.mockResolvedValueOnce([player]);
      staffRepo.find.mockResolvedValueOnce([
        { teamId: 'team-1' as Uuid, level: 0 } as unknown as StaffEntity,
      ]);

      await service.processDailyInjuryRecovery();
      expect(dataSource.transaction).toHaveBeenCalledTimes(1);
      expect(playerRepo.find).toHaveBeenCalledTimes(1);

      // Second tick immediately after: skipped because the
      // dedup timestamp is fresh. No new queries, no transaction.
      // (We do NOT mock `playerRepo.find` here — the assertion
      // is that the dedup check short-circuits before any DB hit,
      // so a follow-up `find` call would have nothing to consume.)
      await service.processDailyInjuryRecovery();

      // Still 1 from the first tick; the second tick made 0 calls.
      expect(playerRepo.find).toHaveBeenCalledTimes(1);
      expect(staffRepo.find).toHaveBeenCalledTimes(1);
      expect(dataSource.transaction).toHaveBeenCalledTimes(1);
    });
  });
});



