/**
 * Regression tests for **when** a tactical instruction runs.
 *
 * An instruction carries two different things and they must not be
 * confused:
 *
 *   * `minute` — the earliest minute the change may happen. A floor,
 *     not a deadline.
 *   * `condition` — the score state that must hold at the moment it
 *     actually runs.
 *
 * The engine used to require BOTH on the same minute: a 「60 分钟落后时」
 * substitution in a match the team led until the 70th minute never
 * happened, and the manager got no feedback at all. Instructions now
 * stay pending until their condition first holds, so the change lands
 * at minute 70 instead — at most once.
 *
 * The predicate itself (`shouldFire`) was never the doubtful part; the
 * question was whether the loop re-checks a pending instruction on
 * later minutes. So these drive `applyInstructionsForTeam` minute by
 * minute with an explicit `scoreStatus`, exactly as `simulateMinute`
 * does, and two of them run the full `simulateMatch` loop as a wiring
 * check.
 */
import { MatchEngine, MatchEvent } from './match.engine';
import { Team } from './classes/Team';
import { TacticalInstruction, TacticalPlayer } from './types/simulation.types';
import { Player } from '../types/player.types';

interface EngineInternals {
  applyInstructionsForTeam(
    team: Team,
    instructions: TacticalInstruction[],
    minute: number,
    scoreStatus: 'leading' | 'draw' | 'trailing',
    fired: Set<number>,
  ): void;
}

const internals = (engine: MatchEngine): EngineInternals =>
  engine as unknown as EngineInternals;

const mkPlayer = (id: number, name: string, pos: string, ovr: number): Player => ({
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
): TacticalPlayer => ({ player: mkPlayer(id, name, pos, ovr), positionKey });

const HOME_SLOTS: Array<[number, string, string, string]> = [
  [1, 'GK', 'GK', 'GK'],
  [2, 'LB', 'FB', 'LB'],
  [3, 'CB1', 'CB', 'CD'],
  [4, 'CB2', 'CB', 'CDR'],
  [5, 'RB', 'FB', 'RB'],
  [6, 'CM1', 'CM', 'CML'],
  [7, 'CM2', 'CM', 'CMC'],
  [8, 'CM3', 'CM', 'CMR'],
  [9, 'LW', 'W', 'LW'],
  [10, 'RW', 'W', 'RW'],
  [11, 'ST', 'CF', 'CF'],
];

function buildTeam(name: string, idBase = 0): Team {
  const starters: TacticalPlayer[] = HOME_SLOTS.map(
    ([id, pname, pos, slot]) =>
      mkTactical(idBase + id, pname, pos, id === 1 ? 50 : 60, slot),
  );
  return new Team(name, starters, 0, name);
}

function bench(): Map<number, TacticalPlayer> {
  return new Map([
    [900, mkTactical(900, 'CM-Sub', 'CM', 65, 'CML')],
    [901, mkTactical(901, 'CM-Sub2', 'CM', 65, 'CML')],
  ]);
}

function buildEngine(instructions: TacticalInstruction[]): {
  engine: MatchEngine;
  team: Team;
} {
  const home = buildTeam('HomeFC');
  const engine = new MatchEngine(
    home,
    buildTeam('AwayFC', 100),
    instructions,
    [],
    bench(),
    null,
    null,
    'cloudy',
  );
  return { engine, team: home };
}

const subFor = (
  minute: number,
  condition: TacticalInstruction['condition'],
  playerId = 6,
  newPlayerId = 900,
): TacticalInstruction => ({
  minute,
  type: 'swap',
  playerId,
  newPlayerId,
  newPosition: 'CML',
  condition,
});

// Instruction-driven substitutions only. A severe injury can also put a
// bench player on (the engine now falls back to the spare bench when the
// manager never stored a `bench_config`), and that forced change is not
// what these assertions are about — the plan's `swap` carries no `reason`.
const substitutions = (engine: MatchEngine): MatchEvent[] =>
  (engine as unknown as { events: MatchEvent[] }).events.filter(
    (e) =>
      e.type === 'substitution' &&
      (e.data as { reason?: string } | undefined)?.reason !== 'injury',
  );

describe('instruction timing — minute is a floor, condition is the trigger', () => {
  it('does not run before its minute, even when the condition already holds', () => {
    const ins = [subFor(60, 'leading')];
    const { engine, team } = buildEngine(ins);
    const fired = new Set<number>();

    internals(engine).applyInstructionsForTeam(team, ins, 59, 'leading', fired);

    expect(substitutions(engine)).toHaveLength(0);
    expect(fired.size).toBe(0);
  });

  it('waits past its minute and runs at the first minute the condition holds', () => {
    const ins = [subFor(60, 'leading')];
    const { engine, team } = buildEngine(ins);
    const fired = new Set<number>();

    // Still level at 60-62: the instruction must survive those minutes.
    internals(engine).applyInstructionsForTeam(team, ins, 60, 'draw', fired);
    internals(engine).applyInstructionsForTeam(team, ins, 61, 'draw', fired);
    internals(engine).applyInstructionsForTeam(team, ins, 62, 'trailing', fired);
    expect(substitutions(engine)).toHaveLength(0);
    expect(fired.size).toBe(0);

    // A goal goes in at 70 and the team leads — now it runs.
    internals(engine).applyInstructionsForTeam(team, ins, 70, 'leading', fired);
    const subs = substitutions(engine);
    expect(subs).toHaveLength(1);
    expect(subs[0].minute).toBe(70);
    expect(team.activeSubstitutions).toBe(1);
  });

  it('runs at most once, however many later minutes satisfy the condition', () => {
    const ins = [subFor(60, 'leading')];
    const { engine, team } = buildEngine(ins);
    const fired = new Set<number>();

    internals(engine).applyInstructionsForTeam(team, ins, 60, 'leading', fired);
    internals(engine).applyInstructionsForTeam(team, ins, 61, 'leading', fired);
    internals(engine).applyInstructionsForTeam(team, ins, 80, 'leading', fired);

    expect(substitutions(engine)).toHaveLength(1);
    expect(team.activeSubstitutions).toBe(1);
  });

  it('applies two instructions that become due on the same minute in minute order', () => {
    const ins = [subFor(70, 'trailing', 7, 901), subFor(60, 'trailing', 6, 900)];
    const { engine, team } = buildEngine(ins);
    const fired = new Set<number>();

    internals(engine).applyInstructionsForTeam(team, ins, 75, 'trailing', fired);

    const subs = substitutions(engine);
    expect(subs).toHaveLength(2);
    // The 60' instruction must not be applied after the 70' one; the
    // incoming ids (900 from the 60' row, 901 from the 70' row) are the
    // observable order.
    const incoming = subs.map(
      (e) => (e.data as { newPlayerId?: number }).newPlayerId,
    );
    expect(incoming).toEqual([900, 901]);
  });

  it('keeps waiting into extra time', () => {
    const ins = [subFor(90, 'trailing')];
    const { engine, team } = buildEngine(ins);
    const fired = new Set<number>();

    internals(engine).applyInstructionsForTeam(team, ins, 90, 'leading', fired);
    expect(substitutions(engine)).toHaveLength(0);

    internals(engine).applyInstructionsForTeam(team, ins, 104, 'trailing', fired);
    expect(substitutions(engine)).toHaveLength(1);
    expect(substitutions(engine)[0].minute).toBe(104);
  });
});

describe('instruction timing — through the real match loop', () => {
  it('fires a minute-1 instruction whose condition holds at kickoff', () => {
    // 0-0 at minute 1, so `notTrailing` is already true.
    const ins: TacticalInstruction[] = [
      {
        minute: 1,
        type: 'move',
        playerId: 7,
        newPosition: 'DM',
        condition: 'notTrailing',
      },
    ];
    const { engine, team } = buildEngine(ins);
    engine.simulateMatch();

    // A `move` is silent on the event stream — assert the pitch state.
    expect(team.players.find((p) => p.player.id === 7)?.positionKey).toBe('DM');
  });

  it('fires each unconditional instruction exactly once', () => {
    const ins: TacticalInstruction[] = [subFor(1, undefined)];
    const { engine, team } = buildEngine(ins);
    engine.simulateMatch();

    expect(substitutions(engine)).toHaveLength(1);
    expect(team.activeSubstitutions).toBe(1);
  });
});
