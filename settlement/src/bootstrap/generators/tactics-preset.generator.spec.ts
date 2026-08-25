import { TacticsPresetGenerator } from './tactics-preset.generator';
import { LOGGER_SERVICE } from '@goalxi/logger';
import {
  PlayerEntity,
  TacticsPresetEntity,
  TeamEntity,
} from '@goalxi/database';

/**
 * Smoke spec for the per-team default-preset
 * generator. Pins the contract (one preset per
 * team, isDefault=true, random formation) so a
 * regression to "all 4-4-2" or "one preset
 * shared across teams" gets caught.
 */
describe('TacticsPresetGenerator', () => {
  const mockLogger = {
    info: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    error: jest.fn(),
  };

  function build() {
    const presetRepo = {
      find: jest.fn(),
      create: jest.fn((data: any) => ({ ...data })),
      save: jest.fn(async (rows: any[]) => rows),
    };
    const teamRepo = {
      find: jest.fn(),
    };
    const playerRepo = {
      find: jest.fn(),
    };
    return {
      gen: new TacticsPresetGenerator(
        mockLogger as any,
        presetRepo as any,
        teamRepo as any,
        playerRepo as any,
      ),
      presetRepo,
      teamRepo,
      playerRepo,
    };
  }

  const team = (id: string): TeamEntity =>
    ({ id, name: `T${id}`, leagueId: 'L1' }) as TeamEntity;

  const player = (id: number, position: string): PlayerEntity =>
    ({
      id,
      name: `P${id}`,
      currentSkills: {},
      isGoalkeeper: position === 'GK',
    }) as PlayerEntity;

  beforeEach(() => {
    mockLogger.info.mockClear();
  });

  it('skips when no teams exist', async () => {
    const { gen, presetRepo, teamRepo } = build();
    teamRepo.find.mockResolvedValue([]);
    presetRepo.find.mockResolvedValue([]);
    await gen.generate();
    expect(presetRepo.save).not.toHaveBeenCalled();
  });

  it('skips teams that already have a default preset', async () => {
    const { gen, presetRepo, teamRepo, playerRepo } = build();
    const t = team('T1');
    teamRepo.find.mockResolvedValue([t]);
    presetRepo.find.mockResolvedValue([{ id: 'p1', teamId: 'T1' }]);
    playerRepo.find.mockResolvedValue([]);
    await gen.generate();
    expect(presetRepo.save).not.toHaveBeenCalled();
  });

  it('creates one preset per new team with isDefault=true', async () => {
    const { gen, presetRepo, teamRepo, playerRepo } = build();
    const t1 = team('T1');
    const t2 = team('T2');
    teamRepo.find.mockResolvedValue([t1, t2]);
    // T1 already has a preset, T2 doesn't.
    presetRepo.find.mockResolvedValue([{ id: 'p1', teamId: 'T1' }]);
    // T2 has 16 players covering all positions.
    const players: PlayerEntity[] = [
      player(1, 'GK'),
      player(2, 'GK'),
      player(3, 'CD'),
      player(4, 'CD'),
      player(5, 'LB'),
      player(6, 'RB'),
      player(7, 'CM'),
      player(8, 'CM'),
      player(9, 'CM'),
      player(10, 'CM'),
      player(11, 'DM'),
      player(12, 'AM'),
      player(13, 'LW'),
      player(14, 'RW'),
      player(15, 'CF'),
      player(16, 'CF'),
    ];
    playerRepo.find.mockResolvedValue(players);

    await gen.generate();

    // Only T2's preset is created.
    expect(presetRepo.save).toHaveBeenCalled();
    const savedRows = presetRepo.save.mock.calls[0][0];
    expect(savedRows).toHaveLength(1);
    const p = savedRows[0];
    expect(p.teamId).toBe('T2');
    expect(p.isDefault).toBe(true);
    // Formation label is one of the 5 valid options.
    expect(['4-4-2', '4-3-3', '4-2-3-1', '3-5-2', '5-3-2']).toContain(
      p.formation,
    );
    // Lineup v2 is non-empty (auto-lineup filled it).
    expect(Object.keys(p.lineupV2).length).toBeGreaterThan(0);
    // Every value must be a positive int (the new strict
    // parsePlayerId contract). The old `Number(id) + ?? 0`
    // pattern would silently stamp 0 here, so any 0 / negative
    // / NaN value in the saved lineup fails this assertion and
    // surfaces the bug at test time instead of in a live match
    // report a week later.
    for (const v of Object.values(p.lineupV2)) {
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThan(0);
    }
  });

  /**
   * Source-level tripwires. The historical lenient
   * `Number(id) + isFinite + ?? 0` pattern was the root cause
   * of the UUID→0 bug. The behavioural test above catches
   * the symptom; these tripwires catch the source pattern
   * re-appearing so a future contributor (or a copy-paste
   * from another file) can't silently regress.
   *
   * We strip line comments before matching so a future
   * docstring rewrite describing the bug doesn't trip the
   * test on its own prose. The tripwire targets the CODE
   * surface, not the documentation.
   */
  describe('source-level tripwires (no silent UUID→0 fallback)', () => {
    const fs = require('fs');
    const path = require('path');
    const raw = fs.readFileSync(
      path.join(__dirname, 'tactics-preset.generator.ts'),
      'utf8',
    );
    // Strip // line comments and /* … */ block comments so
    // the regex only sees code.
    const code = raw
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '');

    it('does not use the lenient Number() + isFinite + ?? 0 pattern', () => {
      // Number(...) on a stringified id, isFinite as the gate,
      // ?? 0 as the fallback — any one of them coming back is
      // a regression. The `parsePlayerId` import below is the
      // replacement and is asserted separately.
      expect(code).not.toMatch(/Number\s*\(/);
      expect(code).not.toMatch(/isFinite/);
      expect(code).not.toMatch(/\?\?\s*0/);
    });

    it('uses parsePlayerId (the strict util) instead', () => {
      expect(raw).toMatch(/parsePlayerId/);
    });
  });
});
