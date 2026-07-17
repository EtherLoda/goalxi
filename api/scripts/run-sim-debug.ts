/**
 * run-sim-debug.ts — dev-only: set up lineups + simulate a single match.
 *
 * Usage:
 *   cd api && pnpm ts-node -r tsconfig-paths/register scripts/run-sim-debug.ts
 *
 * What it does:
 *   1. Loads a match by id (default = the one in DEV_MATCH_ID).
 *   2. Resets status → SCHEDULED and pushes scheduledAt to ~24h ago
 *      (the simulator's lock window is 30 minutes before kickoff, so
 *      "yesterday" always unlocks tactics + allows the simulation to
 *      start the moment we queue it).
 *   3. Picks the 11 best players per team (1 GK + top 10 outfield by
 *      average skill) and writes both tactics using the NEW canonical
 *      slot keys (GK/CB1-3/LB/RB/DMF1-3/CM1-3/CAM1-3/LM/RM/LW/RW/
 *      CFL/CF/CFR) — the same slots the editor + match page read.
 *   4. POSTs `/matches/:id/simulate` against the running API to push a
 *      BullMQ job onto the match-simulation queue.
 *   5. Polls `GET /matches/:id` until status is `completed` (or 5 min
 *      timeout) so the script returns only after the events land.
 *
 * Pre-conditions:
 *   - API service running on API_BASE (default http://localhost:3000/api/v1)
 *   - Database reachable at the same env vars as setup-match-db.ts
 *   - Simulator service running + bound to the same Redis (it picks the
 *     job off the queue)
 *
 * Idempotent: re-running just rewrites the same tactics + resets the
 * scheduledAt. Pair with `pnpm clear:events` if you need a fresh event
 * log; this script does NOT delete existing events so it can be re-run
 * without losing the first run's history.
 */

import 'reflect-metadata';

if (process.env.DATABASE_TYPE === undefined) {
  process.env.DATABASE_TYPE = 'postgres';
  process.env.DATABASE_HOST = 'localhost';
  process.env.DATABASE_PORT = '25432';
  process.env.DATABASE_USERNAME = 'postgres';
  process.env.DATABASE_PASSWORD = 'postgres';
  process.env.DATABASE_NAME = 'goalxi';
}

import { MatchEntity, MatchStatus, PlayerEntity } from '@goalxi/database';
import { AppDataSource } from '../src/database/data-source';

const DEV_MATCH_ID =
  process.env.DEV_MATCH_ID ?? 'd7b7a708-edc9-4afa-8638-0bdf295cb105';
const API_BASE = process.env.API_BASE ?? 'http://localhost:3000/api/v1';
const POLL_INTERVAL_MS = 2000;
const POLL_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

// ============================================================================
// HTTP helpers (Node 18+ has fetch). The simulate endpoint is `@Public()`
// in match.controller.ts so no auth headers are required.
// ============================================================================

async function fetchJson<T>(url: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`${url} → ${res.status}: ${body}`);
  }
  return res.json() as Promise<T>;
}

async function patchMatchScheduledAt(
  matchId: string,
  iso: string,
): Promise<void> {
  await fetchJson(`${API_BASE}/matches/${matchId}`, {
    method: 'PATCH',
    body: JSON.stringify({ scheduledAt: iso }),
  });
}

async function postSimulate(matchId: string): Promise<{ status: string }> {
  return fetchJson(`${API_BASE}/matches/${matchId}/simulate`, {
    method: 'POST',
  });
}

/**
 * Submit tactics via the API rather than writing directly to the DB. The
 * simulator runs in a separate process and reads from a connection string
 * that — for reasons we don't fully understand today — didn't see the
 * rows our DB-side script wrote. Going through the API (match.service
 * .submitTactics) makes the workflow identical to what the editor uses,
 * so the simulator and the API agree on what's persisted.
 */
async function postTactics(
  matchId: string,
  teamId: string,
  formation: string,
  lineup: Record<string, string | null>,
): Promise<void> {
  // Backend refuses bench slots in the lineup payload — strip nulls and
  // canonical keys only. Formation string mirrors what the editor sends.
  await fetchJson(`${API_BASE}/matches/${matchId}/tactics`, {
    method: 'POST',
    body: JSON.stringify({
      teamId,
      formation,
      lineup,
      tempo: 'balanced',
      pitchWidth: 'balanced',
      defensiveLine: 'mid',
    }),
  });
}

async function getMatch(
  matchId: string,
): Promise<{ status: string; homeScore?: number; awayScore?: number }> {
  return fetchJson(`${API_BASE}/matches/${matchId}`);
}

// ============================================================================
// Player selection — pick best GK + top 10 outfield by avg skill.
// Same heuristic as setup-match-db.ts so the resulting lineups match
// what a manual "Auto-fill" would produce.
// ============================================================================

interface Ranked {
  gk: PlayerEntity | null;
  outfield: PlayerEntity[];
}

function pickTeamEleven(players: PlayerEntity[]): Ranked {
  const eligible = players.filter((p) => !p.isYouth && p.currentSkills);
  const score = (p: PlayerEntity): number => {
    if (!p.currentSkills) return 0;
    const cat = (k: 'physical' | 'technical' | 'mental') => {
      const v = p.currentSkills[k];
      if (!v) return 0;
      const arr = Object.values(v);
      return arr.length === 0
        ? 0
        : arr.reduce((s, x) => s + (typeof x === 'number' ? x : 0), 0) /
            arr.length;
    };
    return (cat('physical') + cat('technical') + cat('mental')) / 3;
  };
  const gks = eligible
    .filter((p) => p.isGoalkeeper)
    .sort((a, b) => score(b) - score(a));
  const outfield = eligible
    .filter((p) => !p.isGoalkeeper)
    .sort((a, b) => score(b) - score(a))
    .slice(0, 10);
  return { gk: gks[0] ?? null, outfield };
}

// Formation templates — same shape as the editor's canonical lineups.
// Home: 4-3-3 (GK + 4 DEF + 3 CM + 3 FW). Away: 4-2-3-1 (GK + 4 DEF +
// 2 DM + 3 AM + 1 CF). The exact formation strings are computed by
// the FE's `computeFormation` helper, but the lineup slot keys are the
// single source of truth — both editor + validator read these.
function home433Lineup(eleven: Ranked): Record<string, string | null> {
  const { gk, outfield } = eleven;
  return {
    GK: gk?.id ?? null,
    LB: outfield[0]?.id ?? null,
    CB1: outfield[1]?.id ?? null,
    CB2: outfield[2]?.id ?? null,
    CB3: outfield[3]?.id ?? null,
    RB: outfield[4]?.id ?? null,
    CM1: outfield[5]?.id ?? null,
    CM2: outfield[6]?.id ?? null,
    CM3: outfield[7]?.id ?? null,
    LW: outfield[8]?.id ?? null,
    CF: outfield[9]?.id ?? null, // Only 10 outfield → drop the RW,
    // run 4-3-3 with CF instead of full trio.
  };
}

function away4231Lineup(eleven: Ranked): Record<string, string | null> {
  const { gk, outfield } = eleven;
  return {
    GK: gk?.id ?? null,
    LB: outfield[0]?.id ?? null,
    CB1: outfield[1]?.id ?? null,
    CB2: outfield[2]?.id ?? null,
    RB: outfield[3]?.id ?? null,
    DMF1: outfield[4]?.id ?? null,
    DMF2: outfield[5]?.id ?? null,
    CAM1: outfield[6]?.id ?? null,
    CAM2: outfield[7]?.id ?? null,
    CAM3: outfield[8]?.id ?? null,
    CF: outfield[9]?.id ?? null,
  };
}

// ============================================================================
// Main
// ============================================================================

async function run() {
  console.log(`🚀 run-sim-debug — match ${DEV_MATCH_ID}`);
  console.log(`   API: ${API_BASE}\n`);

  console.log('🔌 Connecting to database…');
  await AppDataSource.initialize();
  console.log('   ✅ Connected\n');

  const matchRepo = AppDataSource.getRepository(MatchEntity);
  const playerRepo = AppDataSource.getRepository(PlayerEntity);

  // ----- 1. Load + reset match -----
  const match = await matchRepo.findOne({
    where: { id: DEV_MATCH_ID },
    relations: ['homeTeam', 'awayTeam'],
  });
  if (!match) throw new Error(`Match ${DEV_MATCH_ID} not found`);

  console.log(`📋 Match: ${match.homeTeam.name} vs ${match.awayTeam.name}`);
  console.log(`   Current status: ${match.status}`);
  console.log(`   Current scheduledAt: ${match.scheduledAt.toISOString()}`);

  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
  // 30 minutes after midnight yesterday — keeps the date clean when
  // looking at events on the timeline.
  yesterday.setUTCHours(0, 30, 0, 0);

  match.scheduledAt = yesterday;
  match.status = MatchStatus.SCHEDULED;
  match.tacticsLocked = false;
  await matchRepo.save(match);
  console.log(`   ✓ scheduledAt → ${yesterday.toISOString()} (24h ago)`);
  console.log(`   ✓ status → ${match.status}\n`);

  // The submitTactics endpoint rejects any post-deadline submission. Now
  // that scheduledAt is yesterday, "deadline = -30min" is in the past
  // and the check throws "deadline has passed". Workaround: push kickoff
  // to ~60 minutes in the future for the duration of the POSTs, then
  // rewind to yesterday. The PATCH writes go through the API so the
  // cache stays in sync (we rely on this cache later for the simulate
  // gate check).
  const farFuture = new Date(Date.now() + 60 * 60 * 1000);
  console.log('📡 PATCH scheduledAt → +60min (so POST tactics passes deadline)');
  await patchMatchScheduledAt(match.id, farFuture.toISOString());
  console.log('   ✓ ok\n');

  // ----- 2. Build + write both lineups -----
  const homePlayers = await playerRepo.find({
    where: { teamId: match.homeTeamId },
  });
  const awayPlayers = await playerRepo.find({
    where: { teamId: match.awayTeamId },
  });
  console.log(
    `👥 Players — home: ${homePlayers.length}, away: ${awayPlayers.length}`,
  );

  const homeEleven = pickTeamEleven(homePlayers);
  const awayEleven = pickTeamEleven(awayPlayers);
  if (!homeEleven.gk || homeEleven.outfield.length < 10) {
    throw new Error('Home team is short on players');
  }
  if (!awayEleven.gk || awayEleven.outfield.length < 10) {
    throw new Error('Away team is short on players');
  }

  // Submit via HTTP rather than the DB — see fetchJson note in
  // postTactics() above for why DB writes were lost.
  console.log('📡 POST home tactics via API …');
  await postTactics(
    match.id,
    match.homeTeamId,
    '4-3-3',
    home433Lineup(homeEleven),
  );
  console.log(
    `   ✓ Home tactics saved (4-3-3, ${Object.values(home433Lineup(homeEleven)).filter(Boolean).length} slots filled)`,
  );

  console.log('📡 POST away tactics via API …');
  await postTactics(
    match.id,
    match.awayTeamId,
    '4-2-3-1',
    away4231Lineup(awayEleven),
  );
  console.log(
    `   ✓ Away tactics saved (4-2-3-1, ${Object.values(away4231Lineup(awayEleven)).filter(Boolean).length} slots filled)\n`,
  );

  // ----- 3. Rewind scheduledAt → yesterday + trigger simulation via API -----
  console.log('📡 PATCH scheduledAt → yesterday (rewind for lock unlock)');
  await patchMatchScheduledAt(match.id, yesterday.toISOString());
  console.log('   ✓ ok\n');

  console.log('📡 POST /matches/:id/simulate …');
  const sim = await postSimulate(match.id);
  console.log(`   ✓ queued: ${sim.status}\n`);

  // ----- 4. Poll for completion -----
  console.log('⏳ Polling match status (every 2s, max 5min) …');
  const start = Date.now();
  let lastStatus = String(match.status);
  while (Date.now() - start < POLL_TIMEOUT_MS) {
    const m = await getMatch(match.id);
    if (m.status !== lastStatus) {
      console.log(`   ▸ status ${lastStatus} → ${m.status}`);
      lastStatus = m.status;
    }
    if (m.status === MatchStatus.COMPLETED) {
      console.log(
        `\n✅ Simulation complete — final score ${m.homeScore ?? 0}-${m.awayScore ?? 0}`,
      );
      break;
    }
    if (m.status === MatchStatus.CANCELLED) {
      throw new Error('Match was cancelled');
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }

  if (lastStatus !== MatchStatus.COMPLETED) {
    throw new Error(
      `Simulation timed out after ${POLL_TIMEOUT_MS / 1000}s (last status: ${lastStatus})`,
    );
  }

  console.log(`\n📺 Open: http://localhost:8000/matches/${match.id}`);

  await AppDataSource.destroy();
}

run().catch(async (err) => {
  console.error('❌ run-sim-debug failed:', err);
  try {
    await AppDataSource.destroy();
  } catch {}
  process.exit(1);
});
