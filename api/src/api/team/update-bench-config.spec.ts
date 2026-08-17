import type { Uuid } from '@/common/types/common.type';
import {
  BenchConfig,
  PlayerEntity,
  StaffEntity,
  TeamEntity,
} from '@goalxi/database';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { PlayerService } from '../player/player.service';
import { ScoutsService } from '../scouts/scouts.service';
import { BenchConfigBodyDto } from './dto/update-bench-config.req.dto';
import { TeamService } from './team.service';

/**
 * Service-level tests for the bench-config hardening done in
 * `team.service.ts:updateBenchConfig`. The DTO shape is locked down
 * at the controller (see `update-bench-config.req.dto.spec.ts`); this
 * file covers the cross-table rules that the DTO cannot express:
 *
 *   1. Squad membership — every non-null playerId must belong to the
 *      team identified by the URL `:id`.
 *   2. GK slot constraint — the `goalkeeper` slot must reference a
 *      player with `is_goalkeeper = true`.
 *   3. Transactional save — the write only happens after validation,
 *      and a thrown BadRequestException aborts the transaction.
 *
 * Mock pattern follows `finance.service.spec.ts` — provider-per-
 * repository factories with `useFactory`, plus a `DataSource`
 * stub that lets the test supply a transaction callback directly.
 */
describe('TeamService.updateBenchConfig', () => {
  const teamId = 'team-uuid-1' as Uuid;
  const otherTeamId = 'team-uuid-2' as Uuid;

  let service: TeamService;
  let dataSource: { transaction: jest.Mock };

  // The transaction callback receives an EntityManager; we expose
  // a single object holding the inner repositories so the test can
  // wire the actual team/player lookups.
  const teamRepo: { findOneByOrFail: jest.Mock; save: jest.Mock } = {
    findOneByOrFail: jest.fn(),
    save: jest.fn(),
  };
  const playerRepo: { find: jest.Mock } = { find: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();

    dataSource = {
      // The real `dataSource.transaction(cb)` runs `cb(manager)` and
      // returns its result. We mirror that contract so the service
      // sees the manager's repositories, not the top-level ones.
      transaction: jest.fn(async (cb: (manager: unknown) => unknown) =>
        cb({
          getRepository: (entity: unknown) => {
            if (entity === TeamEntity) return teamRepo;
            if (entity === PlayerEntity) return playerRepo;
            throw new Error(`Unexpected repository ${String(entity)}`);
          },
        }),
      ),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TeamService,
        {
          provide: getRepositoryToken(StaffEntity),
          useValue: { find: jest.fn() },
        },
        {
          provide: getRepositoryToken(PlayerEntity),
          useValue: playerRepo,
        },
        {
          provide: getRepositoryToken(TeamEntity),
          useValue: { findOneByOrFail: jest.fn() },
        },
        { provide: DataSource, useValue: dataSource },
        // Other TeamService deps — unused in this spec but must be present
        // so Nest can resolve the constructor.
        {
          provide: PlayerService,
          useValue: { generateRandom: jest.fn() },
        },
        {
          provide: ScoutsService,
          useValue: {},
        },
      ],
    }).compile();

    service = module.get<TeamService>(TeamService);
  });

  const buildTeam = (overrides: Partial<TeamEntity> = {}): TeamEntity => {
    const team = new TeamEntity();
    team.id = teamId;
    team.name = 'Test FC';
    team.shortCode = 'TEST1';
    team.benchConfig = {
      goalkeeper: null,
      centerBack: null,
      fullback: null,
      winger: null,
      centralMidfield: null,
      forward: null,
    };
    Object.assign(team, overrides);
    return team;
  };

  const buildBody = (
    overrides: Partial<BenchConfigBodyDto> = {},
  ): BenchConfigBodyDto => ({
    goalkeeper: null,
    centerBack: null,
    fullback: null,
    winger: null,
    centralMidfield: null,
    forward: null,
    ...overrides,
  });

  describe('happy path', () => {
    it('saves the bench config when all playerIds belong to the team', async () => {
      const team = buildTeam();
      teamRepo.findOneByOrFail.mockResolvedValue(team);
      teamRepo.save.mockResolvedValue(team);
      playerRepo.find.mockResolvedValue([
        { id: 1, teamId, isGoalkeeper: true },
        { id: 2, teamId, isGoalkeeper: false },
        { id: 3, teamId, isGoalkeeper: false },
      ]);

      const body = buildBody({
        goalkeeper: 1,
        centerBack: 2,
        fullback: 3,
      });
      const res = await service.updateBenchConfig(teamId, body);

      expect(teamRepo.save).toHaveBeenCalledTimes(1);
      expect((team.benchConfig as BenchConfig).goalkeeper).toBe(1);
      expect((team.benchConfig as BenchConfig).centerBack).toBe(2);
      // The DTO passes through `id` plus the mapped benchConfig.
      expect(res).toBeDefined();
    });

    it('does not call playerRepo.find when every slot is null', async () => {
      const team = buildTeam();
      teamRepo.findOneByOrFail.mockResolvedValue(team);
      teamRepo.save.mockResolvedValue(team);

      await service.updateBenchConfig(teamId, buildBody({}));

      expect(playerRepo.find).not.toHaveBeenCalled();
      expect(teamRepo.save).toHaveBeenCalledTimes(1);
    });

    it('allows a non-goalkeeper to fill any outfield slot (product rule)', async () => {
      // The user brief: a player can play any outfield position; only
      // the GK slot is locked to a real goalkeeper.
      const team = buildTeam();
      teamRepo.findOneByOrFail.mockResolvedValue(team);
      teamRepo.save.mockResolvedValue(team);
      playerRepo.find.mockResolvedValue([
        { id: 9, teamId, isGoalkeeper: false },
      ]);

      const body = buildBody({
        centerBack: 9,
        fullback: 9,
        winger: 9,
        centralMidfield: 9,
        forward: 9,
      });
      await expect(
        service.updateBenchConfig(teamId, body),
      ).resolves.toBeDefined();
      expect((team.benchConfig as BenchConfig).centerBack).toBe(9);
      expect((team.benchConfig as BenchConfig).forward).toBe(9);
    });
  });

  describe('squad-membership validation', () => {
    it('rejects a playerId that does not exist', async () => {
      const team = buildTeam();
      teamRepo.findOneByOrFail.mockResolvedValue(team);
      playerRepo.find.mockResolvedValue([]); // none found

      const body = buildBody({ centerBack: 999 });
      await expect(service.updateBenchConfig(teamId, body)).rejects.toThrow(
        /Player 999 does not exist/,
      );
      expect(teamRepo.save).not.toHaveBeenCalled();
    });

    it('rejects a playerId that belongs to a different team', async () => {
      const team = buildTeam();
      teamRepo.findOneByOrFail.mockResolvedValue(team);
      playerRepo.find.mockResolvedValue([
        { id: 5, teamId: otherTeamId, isGoalkeeper: false },
      ]);

      const body = buildBody({ forward: 5 });
      await expect(service.updateBenchConfig(teamId, body)).rejects.toThrow(
        /Player 5 does not belong to team/,
      );
      expect(teamRepo.save).not.toHaveBeenCalled();
    });
  });

  describe('goalkeeper-slot validation', () => {
    it('rejects a non-goalkeeper filling the goalkeeper slot', async () => {
      const team = buildTeam();
      teamRepo.findOneByOrFail.mockResolvedValue(team);
      playerRepo.find.mockResolvedValue([
        { id: 1, teamId, isGoalkeeper: false },
      ]);

      const body = buildBody({ goalkeeper: 1 });
      await expect(service.updateBenchConfig(teamId, body)).rejects.toThrow(
        /Player 1 is not a goalkeeper and cannot fill the goalkeeper bench slot/,
      );
      expect(teamRepo.save).not.toHaveBeenCalled();
    });

    it('accepts a real goalkeeper in the goalkeeper slot', async () => {
      const team = buildTeam();
      teamRepo.findOneByOrFail.mockResolvedValue(team);
      teamRepo.save.mockResolvedValue(team);
      playerRepo.find.mockResolvedValue([
        { id: 1, teamId, isGoalkeeper: true },
      ]);

      const body = buildBody({ goalkeeper: 1 });
      await expect(
        service.updateBenchConfig(teamId, body),
      ).resolves.toBeDefined();
    });

    it('leaves the goalkeeper slot null without checking isGoalkeeper', async () => {
      // null means "no sub assigned" — should never trigger the GK
      // check, even if other slots are filled.
      const team = buildTeam();
      teamRepo.findOneByOrFail.mockResolvedValue(team);
      teamRepo.save.mockResolvedValue(team);
      playerRepo.find.mockResolvedValue([
        { id: 2, teamId, isGoalkeeper: false },
      ]);

      const body = buildBody({ goalkeeper: null, centerBack: 2 });
      await expect(
        service.updateBenchConfig(teamId, body),
      ).resolves.toBeDefined();
    });
  });

  describe('transactional save', () => {
    it('runs the lookup + save inside a single dataSource.transaction', async () => {
      const team = buildTeam();
      teamRepo.findOneByOrFail.mockResolvedValue(team);
      teamRepo.save.mockResolvedValue(team);
      playerRepo.find.mockResolvedValue([
        { id: 1, teamId, isGoalkeeper: true },
      ]);

      await service.updateBenchConfig(teamId, buildBody({ goalkeeper: 1 }));

      expect(dataSource.transaction).toHaveBeenCalledTimes(1);
      // findOneByOrFail + save are scoped to the manager's repo,
      // proving the service used the transactional manager.
      expect(teamRepo.findOneByOrFail).toHaveBeenCalledTimes(1);
      expect(teamRepo.save).toHaveBeenCalledTimes(1);
    });

    it('rolls back (no save) when a BadRequestException is thrown', async () => {
      const team = buildTeam();
      teamRepo.findOneByOrFail.mockResolvedValue(team);
      playerRepo.find.mockResolvedValue([]); // → "does not exist"

      const body = buildBody({ centerBack: 42 });
      await expect(service.updateBenchConfig(teamId, body)).rejects.toThrow();

      // No save attempted — validation runs before persistence.
      expect(teamRepo.save).not.toHaveBeenCalled();
    });
  });
});
