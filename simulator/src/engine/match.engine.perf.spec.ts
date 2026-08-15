/**
 * Standalone perf benchmark for `MatchEngine.simulateMatch()`.
 *
 * Not a normal `it()`-style test — measures CPU time of one full
 * 90-minute match (no DB, no WebSocket, no event persistence). Run
 * directly via:
 *
 *   pnpm --filter simulator test:perf
 *   # or: cd simulator && npx jest --testPathPattern=match.engine.perf --runInBand
 *
 * Numbers vary with V8 GC and host load; take the *mean* across N
 * runs, ignore the slowest one. Spec content is gated on
 * `RUN_PERF=1` so a normal `pnpm test` doesn't slow the suite by
 * running 20 full matches.
 */
import { MatchEngine, MatchEvent } from './match.engine';
import { Team } from './classes/Team';
import { TacticalPlayer } from './types/simulation.types';
import { Player } from '../types/player.types';
import { TacticalInstruction } from './types/simulation.types';

const RUN_PERF = process.env.RUN_PERF === '1';
const N = Number(process.env.PERF_N ?? 20);
const WARMUP = 2;

function createMockPlayer(
  id: number,
  name: string,
  ovr: number,
  position: keyof Player['attributes'] extends string ? string : never = 'CM',
): Player {
  // Use position-realistic attribute seeds so the engine's per-position
  // math isn't dominated by a flat profile. Numbers mirror the spec's
  // existing `createMockPlayer` plus per-position tweaks.
  const base: Record<string, number> = {
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
  };
  if (position === 'GK') {
    base.gk_reflexes = Math.max(50, ovr);
    base.gk_handling = Math.max(50, ovr);
    base.gk_aerial = Math.max(50, ovr);
  } else {
    base.gk_reflexes = 10;
    base.gk_handling = 10;
    base.gk_aerial = 10;
  }
  return {
    id,
    name,
    position: 'CM',
    exactAge: [25, 0],
    attributes: base as any,
    currentStamina: 3,
    form: 5,
    experience: 10,
  };
}

function createDiverseTeam(name: string, avgOvr: number): Team {
  // 4-4-2 so the slot-weight pickers in push / counter / pass actually
  // find eligible candidates (mirrors `createDiverseMockTeam` in the
  // regular spec, but with realistic per-position attribute seeds).
  const slots: Array<{ pos: string; key: keyof Player['attributes'] extends string ? string : never }> = [
    { pos: 'GK', key: 'GK' as any },
    { pos: 'LB', key: 'LB' as any },
    { pos: 'CB', key: 'CB' as any },
    { pos: 'CB', key: 'CB' as any },
    { pos: 'RB', key: 'RB' as any },
    { pos: 'LM', key: 'LM' as any },
    { pos: 'CM', key: 'CM' as any },
    { pos: 'CM', key: 'CM' as any },
    { pos: 'RM', key: 'RM' as any },
    { pos: 'CF', key: 'CF' as any },
    { pos: 'CF', key: 'CF' as any },
  ];
  const players: TacticalPlayer[] = slots.map((s, i) => ({
    player: createMockPlayer(i, `${name} P${i}`, avgOvr, s.key as any),
    positionKey: s.pos,
  }));
  return new Team(name, players);
}

function buildEngine(homeOvr: number, awayOvr: number): MatchEngine {
  const home = createDiverseTeam('HomeFC', homeOvr);
  const away = createDiverseTeam('AwayFC', awayOvr);
  // One swap at minute 60 — exercises the swap code path under load.
  const homeSubs = new Map<number, TacticalPlayer>();
  const subP: Player = createMockPlayer(100, 'HomeFC Sub', 70, 'CM' as any);
  homeSubs.set(100, { player: subP, positionKey: 'SUB' });
  const homeInstructions: TacticalInstruction[] = [
    {
      minute: 60,
      type: 'swap',
      playerId: 5,
      newPlayerId: 100,
      newPosition: 'LM',
    },
  ];
  return new MatchEngine(home, away, homeInstructions, [], homeSubs);
}

function ms(nanos: bigint): number {
  return Number(nanos) / 1e6;
}

function percentile(sorted: number[], p: number): number {
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx];
}

(RUN_PERF ? describe : describe.skip)('MatchEngine perf benchmark', () => {
  it(`runs ${N} matches and reports timing (home=80, away=75)`, () => {
    // Warmup: 2 throwaway matches so V8 has compiled the hot paths.
    for (let i = 0; i < WARMUP; i++) {
      const e = buildEngine(80, 75);
      e.simulateMatch();
    }

    // Force GC if exposed (--expose-gc) so the measured time isn't
    // dominated by a single pre-measurement major collection.
    if (typeof (global as any).gc === 'function') {
      (global as any).gc();
    }

    const samples: number[] = [];
    const eventCounts: number[] = [];
    let totalKeyMoments = 0;

    for (let i = 0; i < N; i++) {
      const engine = buildEngine(80, 75);
      const t0 = process.hrtime.bigint();
      const events: MatchEvent[] = engine.simulateMatch();
      const t1 = process.hrtime.bigint();
      const dt = ms(t1 - t0);
      samples.push(dt);
      eventCounts.push(events.length);
      totalKeyMoments += events.filter((e) =>
        ['goal', 'save', 'miss', 'turnover'].includes(e.type),
      ).length;
    }

    samples.sort((a, b) => a - b);
    const sum = samples.reduce((s, v) => s + v, 0);
    const mean = sum / samples.length;
    const min = samples[0];
    const max = samples[samples.length - 1];
    const p50 = percentile(samples, 50);
    const p95 = percentile(samples, 95);
    const avgEvents = eventCounts.reduce((s, v) => s + v, 0) / eventCounts.length;
    const avgMoments = totalKeyMoments / N;

    // eslint-disable-next-line no-console
    console.log(
      `\n[perf] N=${N} warmup=${WARMUP}\n` +
        `  match wall time (ms):\n` +
        `    mean=${mean.toFixed(2)}  p50=${p50.toFixed(2)}  p95=${p95.toFixed(2)}  ` +
        `min=${min.toFixed(2)}  max=${max.toFixed(2)}\n` +
        `  per match: avg events=${avgEvents.toFixed(1)}  ` +
        `avg key-moments (goal/save/miss/turnover)=${avgMoments.toFixed(1)}\n` +
        `  throughput: ${(1000 / mean).toFixed(2)} matches/sec\n`,
    );

    // No assertion — this is a benchmark. We just need Jest to see a test
    // so the suite reports ok. The number above is the deliverable.
    expect(samples.length).toBe(N);
  });
});
