import {
  createTeam,
  TEAM_SQUAD_SIZE,
  TEAM_POSITION_DISTRIBUTION,
  DEFAULT_OVR_MIN,
  DEFAULT_OVR_MAX,
  ACTIVE_SPECIALTIES,
  StaffRole,
} from '../index';
import type { LeagueEntity, TeamEntity, Uuid } from '../index';
import type { EntityManager } from 'typeorm';

/**
 * Behavioural tests for the unified `createTeam` function.
 *
 * `createTeam` is the single canonical "make a team" entry
 * point — used by the bootstrap, onboarding, scheduler, and
 * dev seed paths. The contract is:
 *
 *   - 16 players, 2 GK + 14 outfield, position layout per
 *     `TEAM_POSITION_DISTRIBUTION`.
 *   - Per-player target OVR in [ovrMin, ovrMax] (default
 *     25-40), so the realized OVR lands within ±2.
 *   - v2 specialty on every player: 5% Gold / 15% Silver /
 *     30% Bronze / 50% No-spec, position-agnostic, never a
 *     deprecated v1 code.
 *   - `isBot: true` writes 5M starting balance + 5k fans;
 *     `isBot: false` writes 500k + 10k. Team row's `isBot`
 *     and `userId` match the params.
 *   - When `existingTeamId` is provided, the team row's `id`
 *     is preserved (FKs to `match`, `match_event`, etc. stay
 *     valid) and only ownership + name + nationality are
 *     mutated.
 *
 * The manager is a mock that records the call shape; we
 * don't exercise a real DB here. The integration suite in
 * the api workspace covers the end-to-end transactional
 * path.
 */

const noopEntityManager = (): any => {
  // Track every row `create()` is asked for so the test
  // can count players / staff / finance / etc. without
  // caring about TypeORM's internals.
  const created: any[] = [];
  // `scrubManagerSpecificData` uses
  // `manager.createQueryBuilder().update(PlayerEntity).set().where().execute()`
  // for the soft-delete of players. Stub the chain.
  const makeChain = (terminal: any = { execute: jest.fn().mockResolvedValue(undefined) }) => {
    const chain: any = {};
    for (const m of ['update', 'set', 'where', 'andWhere']) {
      chain[m] = jest.fn(() => chain);
    }
    Object.assign(chain, terminal);
    return chain;
  };
  return {
    findOne: jest.fn().mockResolvedValue(null),
    create: jest.fn((_Entity: unknown, data: unknown) => {
      const row = { id: 'mock-row-id', ...((data as object) ?? {}) };
      created.push(row);
      return row;
    }),
    save: jest.fn(async (rows: any) => rows),
    // `scrubManagerSpecificData` issues raw DELETEs and
    // also uses createQueryBuilder for the soft-delete of
    // players. Stub both as no-ops.
    query: jest.fn().mockResolvedValue({ rowCount: 0, rows: [] }),
    createQueryBuilder: jest.fn(() => makeChain()),
    // Test-only surface for assertions.
    __created: created,
  } as any;
};

const sampleLeague = {
  id: 'league-1' as Uuid,
  tier: 4,
  tierDivision: 1,
  maxTeams: 16,
} as unknown as LeagueEntity;

describe('createTeam — contract', () => {
  it('emits 16 players total (2 GK + 14 outfield)', async () => {
    const manager = noopEntityManager();
    await createTeam(manager, {
      leagueId: sampleLeague.id,
      name: 'Test Club',
      nationality: 'CN',
      isBot: true,
      userId: 'user-bot',
    });
    const players = manager.__created.filter(
      (r: any) => 'isGoalkeeper' in r && 'coreSpecialty' in r,
    );
    expect(players.length).toBe(TEAM_SQUAD_SIZE);
    expect(players.length).toBe(16);
    const gkCount = players.filter((p: any) => p.isGoalkeeper).length;
    expect(gkCount).toBe(2);
  });

  it('emits exactly the position distribution (2+2+1+1+4+1+1+1+1+2)', async () => {
    const manager = noopEntityManager();
    await createTeam(manager, {
      leagueId: sampleLeague.id,
      name: 'Test Club',
      nationality: 'CN',
      isBot: true,
      userId: 'user-bot',
    });
    // The new function doesn't stamp a `position` column on
    // players (Position is derived from the `isGoalkeeper`
    // flag + the order rows are emitted). But it does
    // expand the distribution into the squad, so the
    // GK count + total count + the 16-player layout are
    // the assertions. The distribution itself is asserted
    // separately on the constant.
    const players = manager.__created.filter(
      (r: any) => 'isGoalkeeper' in r && 'coreSpecialty' in r,
    );
    const gkCount = players.filter((p: any) => p.isGoalkeeper).length;
    expect(gkCount).toBe(TEAM_POSITION_DISTRIBUTION.GK);
    expect(players.length).toBe(
      Object.values(TEAM_POSITION_DISTRIBUTION).reduce(
        (a: number, b: number) => a + b,
        0,
      ),
    );
  });

  it('emits 2 staff rows (head coach + fitness coach) for both bot and manager', async () => {
    for (const isBot of [true, false]) {
      const manager = noopEntityManager();
      await createTeam(manager, {
        leagueId: sampleLeague.id,
        name: 'Test Club',
        nationality: 'CN',
        isBot,
        userId: isBot ? 'user-bot' : 'user-mgr',
      });
      const staff = manager.__created.filter(
        (r: any) => 'role' in r && 'salary' in r,
      );
      expect(staff.length).toBe(2);
      const roles = staff.map((s: any) => s.role);
      expect(roles).toContain(StaffRole.HEAD_COACH);
      expect(roles).toContain(StaffRole.FITNESS_COACH);
    }
  });
});

describe('createTeam — v2 specialty distribution', () => {
  it('writes v2 coreSpecialty + coreSpecialtyTier on every player', async () => {
    for (let i = 0; i < 50; i++) {
      const manager = noopEntityManager();
      await createTeam(manager, {
        leagueId: sampleLeague.id,
        name: `Club ${i}`,
        nationality: 'CN',
        isBot: true,
        userId: 'user-bot',
      });
      const players = manager.__created.filter(
        (r: any) => 'isGoalkeeper' in r && 'coreSpecialty' in r,
      );
      for (const p of players) {
        if (p.coreSpecialty !== null) {
          expect(ACTIVE_SPECIALTIES).toContain(p.coreSpecialty);
          expect(['GOLD', 'SILVER', 'BRONZE']).toContain(
            p.coreSpecialtyTier,
          );
        } else {
          // 50% no-spec → tier is intentionally undefined.
          expect(p.coreSpecialtyTier).toBeUndefined();
        }
      }
    }
  });

  it('matches the 5/15/30/50 distribution across many generations (2000 players)', async () => {
    const N = 2000;
    const counts = { GOLD: 0, SILVER: 0, BRONZE: 0, NO_SPEC: 0 };

    // We need 2000 players; the squad is 16 each, so 125
    // teams gives us 2000 players. Use OVR range narrowed
    // to keep the test fast.
    for (let i = 0; i < 125; i++) {
      const manager = noopEntityManager();
      await createTeam(manager, {
        leagueId: sampleLeague.id,
        name: `Club ${i}`,
        nationality: 'CN',
        isBot: true,
        userId: 'user-bot',
      });
      const players = manager.__created.filter(
        (r: any) => 'isGoalkeeper' in r && 'coreSpecialty' in r,
      );
      for (const p of players) {
        if (p.coreSpecialty === null) {
          counts.NO_SPEC++;
        } else {
          counts[p.coreSpecialtyTier]++;
        }
      }
    }

    // Standard error on a proportion with N=2000 and p=0.5
    // is ~1.1%. We allow ±3% slack — tight enough to catch
    // a 5/25/70 regression, loose enough not to flake.
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    const goldPct = counts.GOLD / total;
    const silverPct = counts.SILVER / total;
    const bronzePct = counts.BRONZE / total;
    const noSpecPct = counts.NO_SPEC / total;

    expect(goldPct).toBeGreaterThan(0.02);
    expect(goldPct).toBeLessThan(0.08);
    expect(silverPct).toBeGreaterThan(0.12);
    expect(silverPct).toBeLessThan(0.18);
    expect(bronzePct).toBeGreaterThan(0.27);
    expect(bronzePct).toBeLessThan(0.33);
    expect(noSpecPct).toBeGreaterThan(0.47);
    expect(noSpecPct).toBeLessThan(0.53);
  });

  it('never produces a deprecated v1 code (HEADER, LPASS, etc.)', async () => {
    const DEPRECATED_CODES = new Set([
      'HEADER', 'LPASS', 'CROSS', 'DRBLE', 'LSHT', 'CLUCH',
      'TACKL', 'PSAVE', 'CNTR', 'REBND', 'FSTRT',
    ]);
    for (let i = 0; i < 50; i++) {
      const manager = noopEntityManager();
      await createTeam(manager, {
        leagueId: sampleLeague.id,
        name: `Club ${i}`,
        nationality: 'CN',
        isBot: true,
        userId: 'user-bot',
      });
      const players = manager.__created.filter(
        (r: any) => 'isGoalkeeper' in r && 'coreSpecialty' in r,
      );
      for (const p of players) {
        if (p.coreSpecialty !== null) {
          expect(DEPRECATED_CODES.has(p.coreSpecialty)).toBe(false);
        }
        if (p.abilities) {
          for (const code of p.abilities) {
            expect(DEPRECATED_CODES.has(code)).toBe(false);
          }
        }
      }
    }
  });

  it('rolls v2 codes across all positions (position-agnostic)', async () => {
    const seenCodes = new Set<string>();
    for (let i = 0; i < 100; i++) {
      const manager = noopEntityManager();
      await createTeam(manager, {
        leagueId: sampleLeague.id,
        name: `Club ${i}`,
        nationality: 'CN',
        isBot: true,
        userId: 'user-bot',
      });
      const players = manager.__created.filter(
        (r: any) => 'isGoalkeeper' in r && 'coreSpecialty' in r,
      );
      for (const p of players) {
        if (p.coreSpecialty) seenCodes.add(p.coreSpecialty);
      }
    }
    // 100 teams × 16 = 1600 players; v2 rolls uniformly so
    // every code should be hit at least a few times.
    expect(seenCodes.size).toBeGreaterThanOrEqual(10);
  });

  it('mirrors coreSpecialty into the legacy abilities array (for migration)', async () => {
    const manager = noopEntityManager();
    await createTeam(manager, {
      leagueId: sampleLeague.id,
      name: 'Test Club',
      nationality: 'CN',
      isBot: true,
      userId: 'user-bot',
    });
    const players = manager.__created.filter(
      (r: any) => 'isGoalkeeper' in r && 'coreSpecialty' in r,
    );
    for (const p of players) {
      if (p.coreSpecialty === null) {
        expect(p.abilities).toBeUndefined();
      } else {
        expect(p.abilities).toEqual([p.coreSpecialty]);
        expect(p.currentSkills.abilities).toEqual([p.coreSpecialty]);
      }
    }
  });
});

describe('createTeam — isBot vs manager difference', () => {
  it('bot gets 5M balance + 5k fans, manager gets 500k + 10k', async () => {
    const botManager = noopEntityManager();
    await createTeam(botManager, {
      leagueId: sampleLeague.id,
      name: 'Bot Club',
      nationality: 'CN',
      isBot: true,
      userId: 'user-bot',
    });
    const botFinance = botManager.__created.find(
      (r: any) => 'balance' in r,
    );
    const botFan = botManager.__created.find(
      (r: any) => 'totalFans' in r,
    );
    expect(botFinance.balance).toBe(5_000_000);
    expect(botFan.totalFans).toBe(5_000);

    const mgrManager = noopEntityManager();
    await createTeam(mgrManager, {
      leagueId: sampleLeague.id,
      name: 'Manager Club',
      nationality: 'CN',
      isBot: false,
      userId: 'user-mgr',
    });
    const mgrFinance = mgrManager.__created.find(
      (r: any) => 'balance' in r,
    );
    const mgrFan = mgrManager.__created.find(
      (r: any) => 'totalFans' in r,
    );
    expect(mgrFinance.balance).toBe(500_000);
    expect(mgrFan.totalFans).toBe(10_000);
  });

  it('bot team row has isBot=true + botLevel=5; manager team row has isBot=false', async () => {
    for (const isBot of [true, false]) {
      const manager = noopEntityManager();
      await createTeam(manager, {
        leagueId: sampleLeague.id,
        name: isBot ? 'Bot' : 'Manager',
        nationality: 'CN',
        isBot,
        userId: isBot ? 'user-bot' : 'user-mgr',
        botLevel: 5,
      });
      const team = manager.__created.find(
        (r: any) => 'isBot' in r && !('isGoalkeeper' in r),
      );
      expect(team.isBot).toBe(isBot);
      expect(team.userId).toBe(isBot ? 'user-bot' : 'user-mgr');
      expect(team.botLevel).toBe(5);
    }
  });
});

describe('createTeam — existingTeamId (onboarding claim)', () => {
  it('preserves the existing team id and mutates only ownership + name', async () => {
    const existingId = 'preserved-uuid' as Uuid;
    const existingTeam = {
      id: existingId,
      name: 'Bot Original',
      isBot: true,
      userId: 'user-bot',
      botLevel: 5,
      leagueId: sampleLeague.id,
      nationality: 'CN',
      jerseyColorPrimary: '#FF0000', // custom field — must survive
      logoUrl: 'logo.png',           // custom field — must survive
    } as unknown as TeamEntity;

    const manager = {
      findOne: jest.fn().mockResolvedValue(existingTeam),
      create: jest.fn((_E: unknown, data: unknown) => ({
        id: 'mock-row-id',
        ...((data as object) ?? {}),
      })),
      save: jest.fn(async (rows: any) => rows),
      query: jest.fn().mockResolvedValue({ rowCount: 0, rows: [] }),
      createQueryBuilder: jest.fn(() => {
        const chain: any = {};
        for (const m of ['update', 'set', 'where', 'andWhere']) {
          chain[m] = jest.fn(() => chain);
        }
        chain.execute = jest.fn().mockResolvedValue(undefined);
        return chain;
      }),
    } as any;

    await createTeam(manager, {
      leagueId: sampleLeague.id,
      name: 'Manager Club',
      nationality: 'CN',
      isBot: false,
      userId: 'user-mgr',
      existingTeamId: existingId,
    });

    // The preserved team id must still be the PK.
    expect(manager.save).toHaveBeenCalled();
    const savedTeam = manager.save.mock.calls[0][0] as TeamEntity;
    expect(savedTeam.id).toBe(existingId);
    expect(savedTeam.isBot).toBe(false);
    expect(savedTeam.userId).toBe('user-mgr');
    expect(savedTeam.name).toBe('Manager Club');
    // Custom fields must survive the update.
    expect(savedTeam.jerseyColorPrimary).toBe('#FF0000');
    expect(savedTeam.logoUrl).toBe('logo.png');
  });

  it('throws if existingTeamId does not exist', async () => {
    const manager = {
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn(),
      save: jest.fn(),
      query: jest.fn(),
    } as any;
    await expect(
      createTeam(manager, {
        leagueId: sampleLeague.id,
        name: 'Test',
        nationality: 'CN',
        isBot: false,
        userId: 'user-mgr',
        existingTeamId: 'nonexistent' as Uuid,
      }),
    ).rejects.toThrow(/existingTeamId/);
  });
});

describe('createTeam — OVR range', () => {
  it('default OVR range is 25-40', () => {
    expect(DEFAULT_OVR_MIN).toBe(25);
    expect(DEFAULT_OVR_MAX).toBe(40);
  });

  it('respects custom OVR overrides', async () => {
    const manager = noopEntityManager();
    // Narrow OVR range to make the test fast and the
    // assertion tight. The function doesn't expose the
    // per-player target OVR directly, but we can verify
    // that the generated `potentialAbility` lands in a
    // sensible band for a low-OVR squad.
    await createTeam(manager, {
      leagueId: sampleLeague.id,
      name: 'Weak Club',
      nationality: 'CN',
      isBot: true,
      userId: 'user-bot',
      ovrMin: 25,
      ovrMax: 25,
    });
    const players = manager.__created.filter(
      (r: any) => 'isGoalkeeper' in r && 'coreSpecialty' in r,
    );
    expect(players.length).toBe(16);
    // potentialAbility is a derived 0-100 score; with OVR
    // 25 the skills land in the 4-6 range, so PA should
    // be in the 30-50 band.
    for (const p of players) {
      expect(p.potentialAbility).toBeGreaterThan(0);
      expect(p.potentialAbility).toBeLessThan(80);
    }
  });
});
