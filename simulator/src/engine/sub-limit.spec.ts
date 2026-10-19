/**
 * Regression tests for the **active substitution quota**
 * (`GAME_SETTINGS.MATCH_MAX_SUBSTITUTIONS` = 3).
 *
 * Before this guard the engine happily applied every `type: 'swap'`
 * tactical instruction a manager submitted — `ArrayMaxSize` on the
 * request DTO was the only limit, and it lives in the API, not the
 * engine. A caller that bypassed the DTO (internal job, preset
 * replay, a future batch endpoint) could sub an unlimited number of
 * players. The quota is now enforced inside the engine itself.
 *
 * Scope of the quota: **player-initiated** `swap` instructions only.
 * Forced injury substitutions (`reason: 'injury'`) are a consequence
 * of match events, not a tactical choice, and deliberately do NOT
 * consume the quota — a team can lose a third of its bench to
 * injuries and still make its three planned changes.
 *
 * These tests drive `applyInstructionsForTeam` directly (private) so
 * the assertions are deterministic: no RNG, no full 90-minute
 * simulation.
 */
import { MatchEngine } from './match.engine';
import { Team } from './classes/Team';
import { TacticalPlayer, TacticalInstruction } from './types/simulation.types';
import { Player } from '../types/player.types';
import { GAME_SETTINGS } from '@goalxi/database';

const CAP: number = GAME_SETTINGS.MATCH_MAX_SUBSTITUTIONS;

/**
 * The slice of the engine's private surface these tests drive. Cast
 * through `unknown` so the assertions stay type-checked instead of
 * spreading `any` through the spec (which the repo's eslint config
 * rejects).
 */
interface EngineEvent {
  type: string;
  minute: number;
  data?: { type?: string; newPlayerId?: number };
}

interface EngineInternals {
  events: EngineEvent[];
  applyInstructionsForTeam(
    team: Team,
    instructions: TacticalInstruction[],
    minute: number,
    scoreStatus: string,
    fired: Set<number>,
  ): void;
}

const internals = (engine: MatchEngine): EngineInternals =>
  engine as unknown as EngineInternals;

const mkPlayer = (
  id: number,
  name: string,
  pos: string,
  ovr: number,
): Player => ({
  id,
  name,
  position: pos,
  exactAge: [25, 0],
  attributes: {
    finishing: ovr,
    composure: ovr,
    positioning: ovr,
    strength: ovr,
    pace: ovr,
    dribbling: ovr,
    passing: ovr,
    defending: ovr,
    freeKicks: 50,
    penalties: 50,
    gk_reflexes: 50,
    gk_handling: 50,
    gk_aerial: 50,
  },
  currentStamina: 3,
  form: 5,
  experience: 10,
});

const mkTactical = (
  id: number,
  name: string,
  pos: string,
  ovr: number,
  positionKey: string,
): TacticalPlayer => ({
  player: mkPlayer(id, name, pos, ovr),
  positionKey,
});

/** 11 starters; ids 6/7/8/9 are the CM slots the planned swaps target. */
function buildTeam(name: string, idBase = 0): Team {
  const starters: TacticalPlayer[] = [
    mkTactical(idBase + 1, 'GK', 'GK', 50, 'GK'),
    mkTactical(idBase + 2, 'LB', 'FB', 60, 'LB'),
    mkTactical(idBase + 3, 'CB1', 'CB', 60, 'CD'),
    mkTactical(idBase + 4, 'CB2', 'CB', 60, 'CDR'),
    mkTactical(idBase + 5, 'RB', 'FB', 60, 'RB'),
    mkTactical(idBase + 6, 'CM1', 'CM', 60, 'CML'),
    mkTactical(idBase + 7, 'CM2', 'CM', 60, 'CMC'),
    mkTactical(idBase + 8, 'CM3', 'CM', 60, 'CMR'),
    mkTactical(idBase + 9, 'LW', 'W', 60, 'LW'),
    mkTactical(idBase + 10, 'RW', 'W', 60, 'RW'),
    mkTactical(idBase + 11, 'ST', 'CF', 60, 'CF'),
  ];
  return new Team(name, starters, 0, name);
}

interface Harness {
  engine: MatchEngine;
  homeTeam: Team;
  awayTeam: Team;
  instructions: TacticalInstruction[];
}

/**
 * Home side carries `slots` bench CMs and `slots` planned swaps at
 * distinct minutes (so each instruction finds its target still on the
 * pitch). Bench ids start at 900, swap targets at 6.
 */
function buildHarness(slots: number): Harness {
  const homeTeam = buildTeam('HomeFC');
  const awayTeam = buildTeam('AwayFC', 100);

  const subs = new Map<number, TacticalPlayer>();
  for (let i = 0; i < slots; i++) {
    const id = 900 + i;
    subs.set(id, mkTactical(id, `CM-Sub${i}`, 'CM', 65, 'CML'));
  }

  const instructions: TacticalInstruction[] = [];
  for (let i = 0; i < slots; i++) {
    instructions.push({
      minute: 60 + i,
      type: 'swap',
      playerId: 6 + i,
      newPlayerId: 900 + i,
      newPosition: 'CML',
      condition: 'always',
    });
  }

  const engine = new MatchEngine(
    homeTeam,
    awayTeam,
    instructions,
    [],
    subs,
    null,
    null,
    'cloudy',
  );

  return { engine, homeTeam, awayTeam, instructions };
}

/** Run every instruction at its own minute, as `simulateMinute` would. */
function runInstructions(h: Harness): void {
  // One shared `fired` set per side — the engine keeps it per match so
  // a condition-gated instruction runs once.
  const fired = new Set<number>();
  for (const ins of h.instructions) {
    internals(h.engine).applyInstructionsForTeam(
      h.homeTeam,
      h.instructions,
      ins.minute,
      'draw',
      fired,
    );
  }
}

const swapEvents = (engine: MatchEngine): EngineEvent[] =>
  internals(engine).events.filter(
    (e) => e.type === 'substitution' && e.data?.type === 'swap',
  );

const idsOf = (team: Team): number[] =>
  team.players.filter((p) => !p.isSentOff).map((p) => (p.player as Player).id);

describe('Active substitution quota (engine-enforced)', () => {
  it('applies exactly MATCH_MAX_SUBSTITUTIONS planned swaps and drops the rest', () => {
    expect(CAP).toBe(3);
    const h = buildHarness(CAP + 2); // 5 planned swaps, 5 bench options
    runInstructions(h);

    expect(swapEvents(h.engine)).toHaveLength(CAP);
    expect(h.homeTeam.activeSubstitutions).toBe(CAP);

    // The 4th and 5th instructions must not have reached the pitch:
    // their targets are still on it and their substitutes are not.
    const ids = idsOf(h.homeTeam);
    expect(ids).toContain(9);
    expect(ids).toContain(10);
    expect(ids).not.toContain(903);
    expect(ids).not.toContain(904);

    // ...and the first three did.
    expect(ids).toContain(900);
    expect(ids).toContain(901);
    expect(ids).toContain(902);
  });

  it('does not emit a substitution event for the blocked instruction', () => {
    const h = buildHarness(CAP + 1);
    runInstructions(h);
    const blocked = internals(h.engine).events.filter(
      (e) => e.data?.newPlayerId === 903,
    );
    expect(blocked).toHaveLength(0);
  });

  it('allows fewer than the cap, and stays a no-op at zero', () => {
    const under = buildHarness(1);
    runInstructions(under);
    expect(swapEvents(under.engine)).toHaveLength(1);
    expect(under.homeTeam.activeSubstitutions).toBe(1);

    const none = buildHarness(0);
    runInstructions(none);
    expect(swapEvents(none.engine)).toHaveLength(0);
    expect(none.homeTeam.activeSubstitutions).toBe(0);
  });

  it('tracks the quota per team, not per match', () => {
    const h = buildHarness(CAP + 1);
    runInstructions(h);
    // The away side never received an instruction, so its own counter
    // is untouched and it could still make three changes.
    expect(h.awayTeam.activeSubstitutions).toBe(0);
  });

  it('keeps the quota independent of the existing position-occupied guard', () => {
    // A `move` instruction is a different code path and must not
    // consume substitution quota.
    const homeTeam = buildTeam('HomeFC');
    const awayTeam = buildTeam('AwayFC', 100);
    const engine = new MatchEngine(homeTeam, awayTeam, [], [], new Map());
    const moves: TacticalInstruction[] = [
      {
        minute: 30,
        type: 'move',
        playerId: 9,
        newPosition: 'LM',
        condition: 'always',
      },
    ];
    internals(engine).applyInstructionsForTeam(
      homeTeam,
      moves,
      30,
      'draw',
      new Set<number>(),
    );
    // The move itself must have landed (LM was empty)…
    expect(
      homeTeam.players.find((p) => (p.player as Player).id === 9)?.positionKey,
    ).toBe('LM');
    // …and must not have spent a substitution.
    expect(homeTeam.activeSubstitutions).toBe(0);
  });
});
