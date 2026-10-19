/**
 * Regression tests for **trigger conditions on tactical instructions**
 * (`EventCondition`: always / leading / trailing / tied / notLeading /
 * notTrailing).
 *
 * These drive the real match loop (`simulateMatch`) rather than
 * `shouldFire` in isolation, because the question that kept coming
 * back was never "does `shouldFire` compare two strings correctly" —
 * it was "does the minute the instruction lands on get evaluated
 * against the score at that moment". A unit test on the predicate
 * cannot see a wiring mistake between `simulateMinute` and
 * `processTacticalInstructions`; this can.
 *
 * Minute 1 is the useful probe: the score is 0-0 in every match, so
 * `leading` and `trailing` must both be false and `tied` must be true,
 * with no need to steer the RNG toward a particular scoreline.
 */
import { MatchEngine, MatchEvent } from './match.engine';
import { Team } from './classes/Team';
import { TacticalInstruction, TacticalPlayer } from './types/simulation.types';
import { Player } from '../types/player.types';

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

/** Two bench CMs, so a planned swap always has somewhere to go. */
function bench(): Map<number, TacticalPlayer> {
  return new Map([
    [900, mkTactical(900, 'CM-Sub', 'CM', 65, 'CML')],
    [901, mkTactical(901, 'CM-Sub2', 'CM', 65, 'CML')],
  ]);
}

interface RunResult {
  events: MatchEvent[];
  homeTeam: Team;
}

function runWith(instructions: TacticalInstruction[]): RunResult {
  const engine = new MatchEngine(
    buildTeam('HomeFC'),
    buildTeam('AwayFC', 100),
    instructions,
    [],
    bench(),
    null,
    null,
    'cloudy',
  );
  const events = engine.simulateMatch();
  return { events, homeTeam: engine.homeTeam };
}

const substitutions = (run: RunResult): MatchEvent[] =>
  run.events.filter((e) => e.type === 'substitution');

describe('tactical instruction conditions — through the real match loop', () => {
  it('fires a minute-1 instruction when the team is tied', () => {
    const run = runWith([
      {
        minute: 1,
        type: 'move',
        // 'DM' is unoccupied in this eleven (the midfield trio sits at
        // CML/CMC/CMR), so the move cannot be rejected for a full slot
        // and the assertion is about the condition alone.
        playerId: 7,
        newPosition: 'DM',
        condition: 'tied',
      },
    ]);
    // A `move` is silent on the event stream — it is a position change,
    // not an event — so assert on the pitch state it produced.
    const moved = run.homeTeam.players.find((p) => p.player.id === 7);
    expect(moved?.positionKey).toBe('DM');
  });

  it('fires a notTrailing instruction while the score is level', () => {
    const run = runWith([
      {
        minute: 1,
        type: 'move',
        playerId: 7,
        newPosition: 'DM',
        condition: 'notTrailing',
      },
    ]);
    const moved = run.homeTeam.players.find((p) => p.player.id === 7);
    expect(moved?.positionKey).toBe('DM');
  });

  it('does not fire a leading-only instruction while the score is level', () => {
    const run = runWith([
      {
        minute: 1,
        type: 'swap',
        playerId: 6,
        newPlayerId: 900,
        newPosition: 'CML',
        condition: 'leading',
      },
    ]);
    expect(substitutions(run)).toHaveLength(0);
  });

  it('does not fire a trailing-only instruction while the score is level', () => {
    const run = runWith([
      {
        minute: 1,
        type: 'swap',
        playerId: 6,
        newPlayerId: 900,
        newPosition: 'CML',
        condition: 'trailing',
      },
    ]);
    expect(substitutions(run)).toHaveLength(0);
  });

  it('spends no substitution quota when the condition never holds', () => {
    const run = runWith([
      {
        minute: 1,
        type: 'swap',
        playerId: 6,
        newPlayerId: 900,
        newPosition: 'CML',
        condition: 'leading',
      },
      {
        minute: 30,
        type: 'swap',
        playerId: 7,
        newPlayerId: 901,
        newPosition: 'CMC',
        condition: 'trailing',
      },
    ]);
    expect(substitutions(run)).toHaveLength(0);
    expect(run.homeTeam.activeSubstitutions).toBe(0);
  });

  it('fires an unconditional instruction at its minute', () => {
    const run = runWith([
      {
        minute: 1,
        type: 'swap',
        playerId: 6,
        newPlayerId: 900,
        newPosition: 'CML',
      },
    ]);
    expect(substitutions(run)).toHaveLength(1);
    expect(run.homeTeam.activeSubstitutions).toBe(1);
  });
});
