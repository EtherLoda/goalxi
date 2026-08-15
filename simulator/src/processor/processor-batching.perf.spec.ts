/**
 * Micro-benchmark for the 4 processor-side DB batching wins.
 *
 * Doesn't touch Postgres — measures the in-process patterns we
 * plan to swap. Each `it()` runs the OLD and NEW variants of one
 * transformation and reports the per-iteration cost in
 * microseconds. We then compute the multiplier (how many × the
 * OLD form costs) and the per-match savings.
 *
 * Run with:
 *   RUN_PERF=1 pnpm --filter simulator test:perf:processor
 *   # or: cd simulator && RUN_PERF=1 npx jest --testPathPatterns=processor-batching --runInBand
 */
const RUN_PERF = process.env.RUN_PERF === '1';
const N = Number(process.env.PERF_N ?? 5000);

// --- Synthetic data shapes ---------------------------------------
const NUM_PLAYERS = 22;
const NUM_EVENTS = 150; // typical 90-min match event count

function makePlayers(): Array<{ id: number; name: string }> {
  const out: Array<{ id: number; name: string }> = [];
  for (let i = 0; i < NUM_PLAYERS; i++) {
    out.push({ id: i + 1, name: `Player ${i + 1}` });
  }
  return out;
}

type SimEvent = {
  minute: number;
  type: string;
  teamName: string;
  playerId: number;
  relatedPlayerId: number;
};

function makeEvents(): SimEvent[] {
  const types = ['goal', 'shot_on_target', 'save', 'miss', 'yellow_card', 'red_card'];
  const teams = ['HomeFC', 'AwayFC'];
  const out: SimEvent[] = [];
  for (let i = 0; i < NUM_EVENTS; i++) {
    out.push({
      minute: Math.floor((i * 90) / NUM_EVENTS),
      type: types[i % types.length],
      teamName: teams[i % teams.length],
      playerId: ((i * 7) % NUM_PLAYERS) + 1,
      relatedPlayerId: ((i * 13) % NUM_PLAYERS) + 1,
    });
  }
  return out;
}

function us(t0: bigint, t1: bigint): number {
  return Number(t1 - t0) / 1e3;
}

(RUN_PERF ? describe : describe.skip)('processor batching patterns', () => {
  it('playerName Map (bulk insert): allPlayers.find vs Map.get', () => {
    const players = makePlayers();
    const events = makeEvents();

    // OLD: build a fresh `find` per event row
    let t0 = process.hrtime.bigint();
    for (let i = 0; i < N; i++) {
      for (const e of events) {
        const playerName = e.playerId
          ? players.find((p) => p.id === e.playerId)?.name
          : undefined;
        const assistName = e.relatedPlayerId
          ? players.find((p) => p.id === e.relatedPlayerId)?.name
          : undefined;
        // touch the values so the JIT can't elide them
        if (playerName === 'A' && assistName === 'B') throw new Error('unreachable');
      }
    }
    const oldUs = us(t0, process.hrtime.bigint());

    // NEW: pre-build Map, do O(1) gets
    t0 = process.hrtime.bigint();
    for (let i = 0; i < N; i++) {
      const byId = new Map<number, string>(players.map((p) => [p.id, p.name]));
      for (const e of events) {
        const playerName = e.playerId ? byId.get(e.playerId) : undefined;
        const assistName = e.relatedPlayerId ? byId.get(e.relatedPlayerId) : undefined;
        if (playerName === 'A' && assistName === 'B') throw new Error('unreachable');
      }
    }
    const newUs = us(t0, process.hrtime.bigint());

    const perIterOld = oldUs / N;
    const perIterNew = newUs / N;
    // eslint-disable-next-line no-console
    console.log(
      `\n[perf] playerName Map: OLD=${perIterOld.toFixed(2)}µs  NEW=${perIterNew.toFixed(2)}µs  ` +
        `speedup=${(perIterOld / perIterNew).toFixed(2)}×  ` +
        `per match saved=${(perIterOld - perIterNew).toFixed(2)}µs`,
    );
    expect(true).toBe(true);
  });

  it('calculateStats: 4× events.filter per team vs 1 loop', () => {
    const events = makeEvents();
    const home = 'HomeFC';
    const away = 'AwayFC';

    // OLD: 4 separate filter passes per team
    let t0 = process.hrtime.bigint();
    for (let i = 0; i < N; i++) {
      for (const teamName of [home, away]) {
        const goals = events.filter(
          (e) => e.type === 'goal' && e.teamName === teamName,
        ).length;
        const misses = events.filter(
          (e) => e.type === 'miss' && e.teamName === teamName,
        ).length;
        const savesByOpponent = events.filter(
          (e) => e.type === 'save' && e.teamName !== teamName,
        ).length;
        const corners = events.filter(
          (e) => e.type === 'corner' && e.teamName === teamName,
        ).length;
        const fouls = events.filter(
          (e) => e.type === 'foul' && e.teamName === teamName,
        ).length;
        const yellowCards = events.filter(
          (e) => e.type === 'yellow_card' && e.teamName === teamName,
        ).length;
        const redCards = events.filter(
          (e) => e.type === 'red_card' && e.teamName === teamName,
        ).length;
        if (goals === 999) throw new Error('unreachable');
      }
    }
    const oldUs = us(t0, process.hrtime.bigint());

    // NEW: 1 loop, dispatch by type, accumulate per team
    t0 = process.hrtime.bigint();
    for (let i = 0; i < N; i++) {
      const counters: Record<string, Record<string, number>> = {
        [home]: { goals: 0, misses: 0, savesByOpponent: 0, corners: 0, fouls: 0, yellowCards: 0, redCards: 0 },
        [away]: { goals: 0, misses: 0, savesByOpponent: 0, corners: 0, fouls: 0, yellowCards: 0, redCards: 0 },
      };
      for (const e of events) {
        const tn = e.teamName;
        if (tn !== home && tn !== away) continue;
        const c = counters[tn];
        switch (e.type) {
          case 'goal': c.goals++; break;
          case 'miss': c.misses++; break;
          case 'save': counters[tn === home ? away : home].savesByOpponent++; break;
          case 'corner': c.corners++; break;
          case 'foul': c.fouls++; break;
          case 'yellow_card': c.yellowCards++; break;
          case 'red_card': c.redCards++; break;
        }
      }
      if (counters[home].goals === 999) throw new Error('unreachable');
    }
    const newUs = us(t0, process.hrtime.bigint());

    const perIterOld = oldUs / N;
    const perIterNew = newUs / N;
    // eslint-disable-next-line no-console
    console.log(
      `\n[perf] calculateStats: OLD=${perIterOld.toFixed(2)}µs  NEW=${perIterNew.toFixed(2)}µs  ` +
        `speedup=${(perIterOld / perIterNew).toFixed(2)}×  ` +
        `per match saved=${(perIterOld - perIterNew).toFixed(2)}µs`,
    );
    expect(true).toBe(true);
  });

  it('career stats: events.filter per player vs 1 pass -> Map', () => {
    const players = makePlayers();
    const events = makeEvents();

    // OLD: 22 × events.filter
    let t0 = process.hrtime.bigint();
    for (let i = 0; i < N; i++) {
      for (const p of players) {
        const playerYellowCards = events.filter(
          (e) => e.type === 'yellow_card' && e.playerId === p.id,
        ).length;
        const playerRedCards = events.filter(
          (e) => e.type === 'red_card' && e.playerId === p.id,
        ).length;
        if (playerYellowCards === 999) throw new Error('unreachable');
      }
    }
    const oldUs = us(t0, process.hrtime.bigint());

    // NEW: 1 events pass -> Map<playerId, {yellow, red}>
    t0 = process.hrtime.bigint();
    for (let i = 0; i < N; i++) {
      const cards = new Map<number, { yellow: number; red: number }>();
      for (const e of events) {
        if (!e.playerId) continue;
        if (e.type !== 'yellow_card' && e.type !== 'red_card') continue;
        let c = cards.get(e.playerId);
        if (!c) {
          c = { yellow: 0, red: 0 };
          cards.set(e.playerId, c);
        }
        if (e.type === 'yellow_card') c.yellow++;
        else c.red++;
      }
      for (const p of players) {
        const c = cards.get(p.id) ?? { yellow: 0, red: 0 };
        if (c.yellow === 999) throw new Error('unreachable');
      }
    }
    const newUs = us(t0, process.hrtime.bigint());

    const perIterOld = oldUs / N;
    const perIterNew = newUs / N;
    // eslint-disable-next-line no-console
    console.log(
      `\n[perf] career cards: OLD=${perIterOld.toFixed(2)}µs  NEW=${perIterNew.toFixed(2)}µs  ` +
        `speedup=${(perIterOld / perIterNew).toFixed(2)}×  ` +
        `per match saved=${(perIterOld - perIterNew).toFixed(2)}µs`,
    );
    expect(true).toBe(true);
  });

  it('competition stats: 22× Map.has (findOne) vs 1× Map build + 1× Map.get', () => {
    // Simulate the in-memory cost shape of TypeORM's
    // `findOne` (HashMap lookup) vs the batched `find({In})` +
    // memory-side `Map.get`. The absolute wall time difference is
    // dominated by SQL round trips, but we also save the per-row
    // EM bookkeeping on the in-process path.
    const playerIds = Array.from({ length: NUM_PLAYERS }, (_, i) => i + 1);
    // Pretend half the players already have a comp-stats row.
    const existingIds = new Set(playerIds.filter((id) => id % 2 === 0));

    // OLD: 22 × HashMap.has (one per player)
    let t0 = process.hrtime.bigint();
    for (let i = 0; i < N; i++) {
      const compStatsByPlayer = new Map<number, { playerId: number }>();
      for (const id of existingIds) {
        compStatsByPlayer.set(id, { playerId: id });
      }
      let created = 0;
      for (const id of playerIds) {
        let comp = compStatsByPlayer.has(id) ? compStatsByPlayer.get(id) : undefined;
        if (!comp) {
          comp = { playerId: id };
          created++;
        }
      }
      if (created === 999) throw new Error('unreachable');
    }
    const oldUs = us(t0, process.hrtime.bigint());

    // NEW: 1 batch lookup (simulated as a single Map build from
    // `find` result), then per-player Map.get
    t0 = process.hrtime.bigint();
    for (let i = 0; i < N; i++) {
      // Simulate the single `find({ where: { playerId: In([...]) } })`
      // — one Map build, one logical "SQL round trip".
      const allExisting = new Map<number, { playerId: number }>();
      for (const id of existingIds) {
        allExisting.set(id, { playerId: id });
      }
      let created = 0;
      for (const id of playerIds) {
        const comp = allExisting.get(id);
        if (!comp) created++;
      }
      if (created === 999) throw new Error('unreachable');
    }
    const newUs = us(t0, process.hrtime.bigint());

    const perIterOld = oldUs / N;
    const perIterNew = newUs / N;
    // eslint-disable-next-line no-console
    console.log(
      `\n[perf] competition stats: OLD=${perIterOld.toFixed(2)}µs  NEW=${perIterNew.toFixed(2)}µs  ` +
        `speedup=${(perIterOld / perIterNew).toFixed(2)}×  ` +
        `per match saved=${(perIterOld - perIterNew).toFixed(2)}µs ` +
        `(in-process; the real win is dropping 21 SQL round trips)`,
    );
    expect(true).toBe(true);
  });
});
