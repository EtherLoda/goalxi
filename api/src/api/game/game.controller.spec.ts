import { AuthGuard } from '@/guards/auth.guard';
import { TACTIC_REQUIREMENTS, TEAM_TACTIC_CODES } from '@goalxi/database';
import { Test, TestingModule } from '@nestjs/testing';
import { GameStateService } from './game-state.service';
import { GameController } from './game.controller';

describe('GameController — team tactics', () => {
  let controller: GameController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [GameController],
      providers: [
        {
          provide: GameStateService,
          useValue: { getCurrentSeasonWeek: jest.fn() },
        },
      ],
    })
      // The controller is auth-gated, but nothing under test depends on the
      // JWT — overriding keeps this a pure controller test instead of
      // dragging AuthService and its mail/redis deps into the module.
      .overrideGuard(AuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<GameController>(GameController);
  });

  it('serves every tactic code, in a stable order', () => {
    const { tactics } = controller.getTeamTactics();
    expect(tactics.map((tactic) => tactic.code)).toEqual([
      ...TEAM_TACTIC_CODES,
    ]);
  });

  it('serves the same requirement table the submit endpoint validates against', () => {
    const { tactics } = controller.getTeamTactics();
    for (const tactic of tactics) {
      expect(tactic.requirements).toEqual(
        TACTIC_REQUIREMENTS[tactic.code].map((requirement) => ({
          families: [...requirement.families],
          count: requirement.count,
        })),
      );
    }
  });

  it('every tactic constrains exactly four outfield slots', () => {
    const { tactics } = controller.getTeamTactics();
    for (const tactic of tactics) {
      const total = tactic.requirements.reduce(
        (sum, requirement) => sum + requirement.count,
        0,
      );
      expect(total).toBe(4);
    }
  });

  it('never mentions the goalkeeper family — the GK is not a tactical choice', () => {
    const { tactics } = controller.getTeamTactics();
    const families = tactics.flatMap((tactic) =>
      tactic.requirements.flatMap((requirement) => requirement.families),
    );
    expect(families).not.toContain('GK');
  });

  it('returns fresh arrays so a caller cannot mutate the shared table', () => {
    const first = controller.getTeamTactics();
    first.tactics[0].requirements[0].families.push('GK');
    const second = controller.getTeamTactics();
    expect(second.tactics[0].requirements[0].families).not.toContain('GK');
  });
});
