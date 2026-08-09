/**
 * Regression tests for the "pitch doesn't update after sub / red card" bug.
 *
 * The FE's `<MatchPitch>` reads player IDs from the latest snapshot's
 * `ps` array. Two paths in the engine mutate the on-pitch roster
 * during a match:
 *
 *   1. Severe injury → same-position sub (auto)
 *   2. Red card (no sub, plays with 10 men)
 *
 * Both must be reflected in the *next* periodic snapshot (every 5
 * minutes) — otherwise the FE keeps showing the player who is no
 * longer on the pitch.
 *
 * These tests pin down the engine-side guarantee. They use the
 * public/private engine surface (substitutePlayer, sendOffPlayer,
 * applyInstructionsForTeam, generateSnapshotEvent) to stage the
 * mutation directly, then assert the next snapshot's `ps` no
 * longer contains the removed player.
 */
import { MatchEngine } from './match.engine';
import { Team } from './classes/Team';
import { TacticalPlayer } from './types/simulation.types';
import { Player } from '../types/player.types';
import { BenchConfig } from '@goalxi/database';

describe('Substitution / red card pitch-state propagation', () => {
  // Full-shape player — AttributeCalculator reads many attributes.
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

  const mkTactical = (id: number, name: string, pos: string, ovr: number, positionKey: string): TacticalPlayer => ({
    player: mkPlayer(id, name, pos, ovr),
    positionKey,
  });

  it('next snapshot after substitutePlayer excludes the old player and includes the new one', () => {
    // Build home: 11 starting players (one CM we will sub out)
    const homeStarters: TacticalPlayer[] = [
      mkTactical(1, 'GK', 'GK', 50, 'GK'),
      mkTactical(2, 'LB', 'FB', 60, 'LB'),
      mkTactical(3, 'CB1', 'CB', 60, 'CD'),
      mkTactical(4, 'CB2', 'CB', 60, 'CDR'),
      mkTactical(5, 'RB', 'FB', 60, 'RB'),
      mkTactical(6, 'CM-Out', 'CM', 70, 'CML'),
      mkTactical(7, 'CM2', 'CM', 60, 'CMC'),
      mkTactical(8, 'CM3', 'CM', 60, 'CMR'),
      mkTactical(9, 'LW', 'W', 60, 'LW'),
      mkTactical(10, 'RW', 'W', 60, 'RW'),
      mkTactical(11, 'ST', 'CF', 60, 'CF'),
    ];
    const homeTeam = new Team('HomeFC', homeStarters);

    const awayStarters: TacticalPlayer[] = Array.from({ length: 11 }, (_, i) =>
      mkTactical(100 + i, `Away${i}`, 'CM', 50, i === 0 ? 'GK' : 'CM'),
    );
    const awayTeam = new Team('AwayFC', awayStarters);

    // Bench: one CM sub for the home side
    const benchPlayer = mkTactical(999, 'CM-Sub', 'CM', 65, 'CML');
    const substitutePlayers = new Map<number, TacticalPlayer>([[999, benchPlayer]]);
    const homeBenchConfig: BenchConfig = {
      goalkeeper: null,
      centerBack: null,
      fullback: null,
      winger: null,
      centralMidfield: 999, // <-- 999 = our bench CM
      forward: null,
    } as unknown as BenchConfig;

    const engine = new MatchEngine(
      homeTeam,
      awayTeam,
      [],
      [],
      substitutePlayers,
      homeBenchConfig,
      null,
      'cloudy',
    );

    // Emit a snapshot BEFORE the sub (minute 0)
    (engine as any).generateSnapshotEvent(0);
    // Emit snapshot at minute 5 (periodic, no sub yet)
    (engine as any).generateSnapshotEvent(5);

    // The pre-sub snapshot must list player 6 (CM-Out)
    const before5 = (engine as any).events.find(
      (e: any) => e.minute === 5 && e.type === 'snapshot',
    );
    const before5Ids = (before5.data.h.ps as any[]).map((p: any) => p.id);
    expect(before5Ids).toContain(6);

    // Now perform the substitution: CM-Out (id 6) -> CM-Sub (id 999)
    homeTeam.substitutePlayer(6, benchPlayer);

    // Emit a new snapshot at minute 10 (next periodic mark)
    (engine as any).generateSnapshotEvent(10);

    const after10 = (engine as any).events.find(
      (e: any) => e.minute === 10 && e.type === 'snapshot',
    );
    const after10Ids = (after10.data.h.ps as any[]).map((p: any) => p.id);

    // Pitch must show the new player, not the old one
    expect(after10Ids).toContain(999);
    expect(after10Ids).not.toContain(6);
  });

  it('next snapshot after sendOffPlayer excludes the red-carded player', () => {
    const homeStarters: TacticalPlayer[] = [
      mkTactical(1, 'GK', 'GK', 50, 'GK'),
      mkTactical(2, 'LB', 'FB', 60, 'LB'),
      mkTactical(3, 'CB1', 'CB', 60, 'CD'),
      mkTactical(4, 'CB2', 'CB', 60, 'CDR'),
      mkTactical(5, 'RB', 'FB', 60, 'RB'),
      mkTactical(6, 'CM-SentOff', 'CM', 70, 'CML'),
      mkTactical(7, 'CM2', 'CM', 60, 'CMC'),
      mkTactical(8, 'CM3', 'CM', 60, 'CMR'),
      mkTactical(9, 'LW', 'W', 60, 'LW'),
      mkTactical(10, 'RW', 'W', 60, 'RW'),
      mkTactical(11, 'ST', 'CF', 60, 'CF'),
    ];
    const homeTeam = new Team('HomeFC', homeStarters);

    const awayStarters: TacticalPlayer[] = Array.from({ length: 11 }, (_, i) =>
      mkTactical(100 + i, `Away${i}`, 'CM', 50, i === 0 ? 'GK' : 'CM'),
    );
    const awayTeam = new Team('AwayFC', awayStarters);

    const engine = new MatchEngine(
      homeTeam,
      awayTeam,
      [],
      [],
      new Map(),
      null,
      null,
      'cloudy',
    );

    (engine as any).generateSnapshotEvent(5);
    const beforeIds = ((engine as any).events
      .find((e: any) => e.minute === 5 && e.type === 'snapshot')
      .data.h.ps as any[]).map((p: any) => p.id);
    expect(beforeIds).toContain(6);

    // Send off player 6
    homeTeam.sendOffPlayer(6);

    (engine as any).generateSnapshotEvent(10);
    const afterIds = ((engine as any).events
      .find((e: any) => e.minute === 10 && e.type === 'snapshot')
      .data.h.ps as any[]).map((p: any) => p.id);

    expect(afterIds).not.toContain(6);
    // Team should have 10 on the pitch
    expect(afterIds.length).toBe(10);
  });
});
