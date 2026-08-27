/**
 * sim-direct.ts — dev-only: set scheduledAt + away tactics via direct DB
 * writes, then POST /simulate (which is @Public).
 *
 * Why this exists: the standard sim-debug does the schedule rewind via
 * PATCH /matches/:id which requires auth. The public seed users
 * (admin@goalxi.com / test@goalxi.com) don't authenticate against this
 * dev DB (passwords were never seeded or rotated since last reset), so
 * the API route 401s. This script bypasses auth by writing the
 * schedule + tactics straight to the DB, then calls the @Public
 * simulate endpoint to enqueue the BullMQ job.
 *
 * Usage:
 *   cd api && DEV_MATCH_ID=<uuid> SKIP_HOME_TACTICS=1 pnpm ts-node -r tsconfig-paths/register scripts/sim-direct.ts
 *
 * Pre-conditions:
 *   - DB reachable at the same env vars as the rest of the API
 *   - Simulator service running + bound to the same Redis
 *   - API on http://localhost:3000/api/v1 (configurable via API_BASE)
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

import {
  MatchEntity,
  MatchStatus,
  MatchTacticsEntity,
  PlayerEntity,
} from '@goalxi/database';
import { AppDataSource } from '../src/database/data-source';

const DEV_MATCH_ID =
  process.env.DEV_MATCH_ID ?? 'd7b7a708-edc9-4afa-8638-0bdf295cb105';
const API_BASE = process.env.API_BASE ?? 'http://localhost:3000/api/v1';
const POLL_INTERVAL_MS = 2000;
const POLL_TIMEOUT_MS = 5 * 60 * 1000;

async function fetchJson<T>(url: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...((init.headers as Record<string, string> | undefined) ?? {}),
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`${url} → ${res.status}: ${body}`);
  }
  return res.json() as Promise<T>;
}

async function postSimulate(matchId: string): Promise<{ status: string }> {
  return fetchJson(`${API_BASE}/matches/${matchId}/simulate`, { method: 'POST' });
}

async function getMatch(
  matchId: string,
): Promise<{ status: string; homeScore?: number; awayScore?: number }> {
  return fetchJson(`${API_BASE}/matches/${matchId}`);
}

/** Pick the best XI by average physical/technical/mental skill.
 *  Mirrors run-sim-debug.ts so a re-run produces the same lineup. */
function pickTeamEleven(players: PlayerEntity[]): {
  gk: PlayerEntity | null;
  outfield: PlayerEntity[];
} {
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

function away4231Lineup(eleven: {
  gk: PlayerEntity | null;
  outfield: PlayerEntity[];
}): Record<string, string | null> {
  const { gk, outfield } = eleven;
  return {
    GK: gk?.id != null ? String(gk.id) : null,
    LB: outfield[0]?.id != null ? String(outfield[0].id) : null,
    CBL: outfield[1]?.id != null ? String(outfield[1].id) : null,
    CB: outfield[2]?.id != null ? String(outfield[2].id) : null,
    RB: outfield[3]?.id != null ? String(outfield[3].id) : null,
    DMFL: outfield[4]?.id != null ? String(outfield[4].id) : null,
    DMF: outfield[5]?.id != null ? String(outfield[5].id) : null,
    CAML: outfield[6]?.id != null ? String(outfield[6].id) : null,
    CAM: outfield[7]?.id != null ? String(outfield[7].id) : null,
    CAMR: outfield[8]?.id != null ? String(outfield[8].id) : null,
    CF: outfield[9]?.id != null ? String(outfield[9].id) : null,
  };
}

async function run() {
  console.log(`🚀 sim-direct — match ${DEV_MATCH_ID}`);
  console.log(`   API: ${API_BASE}\n`);

  await AppDataSource.initialize();

  const matchRepo = AppDataSource.getRepository(MatchEntity);
  const matchTacticsRepo = AppDataSource.getRepository(MatchTacticsEntity);
  const playerRepo = AppDataSource.getRepository(PlayerEntity);

  const match = await matchRepo.findOne({
    where: { id: DEV_MATCH_ID },
    relations: ['homeTeam', 'awayTeam'],
  });
  if (!match) throw new Error(`Match ${DEV_MATCH_ID} not found`);

  console.log(`📋 Match: ${match.homeTeam.name} vs ${match.awayTeam.name}`);
  console.log(`   Current status: ${match.status}`);
  console.log(`   Current scheduledAt: ${match.scheduledAt.toISOString()}`);

  // 1. Unlock the match (set scheduledAt to 24h ago).
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
  yesterday.setUTCHours(0, 30, 0, 0);
  match.scheduledAt = yesterday;
  match.status = MatchStatus.SCHEDULED;
  match.tacticsLocked = false;
  await matchRepo.save(match);
  console.log(`   ✓ scheduledAt → ${yesterday.toISOString()} (unlocked)\n`);

  // 2. Inspect existing tactics.
  const homeTactics = await matchTacticsRepo.findOne({
    where: { matchId: match.id, teamId: match.homeTeamId },
  });
  const awayTactics = await matchTacticsRepo.findOne({
    where: { matchId: match.id, teamId: match.awayTeamId },
  });
  console.log(
    `🎯 Tactics — home: ${homeTactics ? homeTactics.formation : 'NONE'}, ` +
      `away: ${awayTactics ? awayTactics.formation : 'NONE'}`,
  );
  if (homeTactics) {
    const slots = Object.keys(homeTactics.lineup).length;
    console.log(`   home lineup has ${slots} slots (preserved as-is)`);
  }

  // 3. Auto-pick away if missing. (Home is preserved per SKIP_HOME_TACTICS.)
  if (!awayTactics) {
    const awayPlayers = await playerRepo.find({
      where: { teamId: match.awayTeamId },
    });
    console.log(`   auto-picking away XI from ${awayPlayers.length} players …`);
    const eleven = pickTeamEleven(awayPlayers);
    if (!eleven.gk || eleven.outfield.length < 10) {
      throw new Error('Away team is short on players');
    }
    const newTactics = matchTacticsRepo.create({
      matchId: match.id,
      teamId: match.awayTeamId,
      formation: '4-2-3-1',
      lineup: away4231Lineup(eleven),
      tempo: 'balanced',
      pitchWidth: 'balanced',
      defensiveLine: 'mid',
    });
    await matchTacticsRepo.save(newTactics);
    console.log(
      `   ✓ Away tactics saved (4-2-3-1, ${Object.values(away4231Lineup(eleven)).filter(Boolean).length} slots)`,
    );
  } else {
    console.log('   away tactics already present, preserved');
  }

  // 4. POST simulate (public, no auth).
  console.log('\n📡 POST /matches/:id/simulate …');
  const sim = await postSimulate(match.id);
  console.log(`   ✓ queued: ${sim.status}\n`);

  // 5. Poll for completion.
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
  console.error('❌ sim-direct failed:', err);
  try {
    await AppDataSource.destroy();
  } catch {}
  process.exit(1);
});
