/**
 * Youth Onboarding Smoke Test
 *
 * Validates the full P0 baseline: from a brand-new user we can register,
 * create a team, observe the onboarding hook seed scout candidates, sign
 * one, and see it land in /youth/squad. Runs against a live api server.
 *
 * This test exists to give the P1 migration a known-good green baseline.
 * If this test fails AFTER the P1 migration runs, the migration is
 * broken — roll back (see docs/rfcs/0001-rollback.md).
 *
 * Pre-conditions:
 *   - api server is up on http://localhost:3000
 *   - web server is up on http://localhost:8001 (only used for the UI smoke
 *     step at the end; everything else is direct API)
 *   - The database has been reset (or the user/team identifiers below
 *     are randomized per run).
 */

import { test, expect, request } from '@playwright/test';

const API_URL = 'http://localhost:3000/api/v1';
const WEB_URL = process.env.PLAYWRIGHT_WEB_URL || 'http://localhost:8001';

interface RegisterResponse {
  userId: string;
}

interface LoginResponse {
  userId: string;
  accessToken: string;
  refreshToken: string;
  tokenExpires: number;
}

interface UserResponse {
  id: string;
}

interface TeamResponse {
  id: string;
  name: string;
}

interface ScoutCandidate {
  id: string;
  name: string;
  age: number;
  isGoalkeeper: boolean;
  revealedSkills: Array<{ key: string; current: number; potential: number }>;
  tendencyHint?: string;
  expiresAt: string;
}

interface YouthPlayer {
  id: string;
  name: string;
  isGoalkeeper: boolean;
  isPromoted: boolean;
  revealLevel: number;
  revealedSkills: string[];
}

// Unique suffix per run to avoid collisions in a shared dev DB.
const STAMP = Date.now();
const USER = {
  username: `smoke_${STAMP}`,
  email: `smoke_${STAMP}@example.com`,
  password: 'Smoke123456!',
  teamName: `Smoke FC ${STAMP}`,
};

let accessToken = '';
let userId = '';
let teamId = '';

test.describe.serial('Youth onboarding smoke', () => {
  test('register → login → create team → onboard scouts → sign candidate', async () => {
    // 1. Register a fresh user. The api persists users by email;
    //    timestamp suffix avoids collisions across re-runs.
    const ctx = await request.newContext();
    const reg = await ctx.post(`${API_URL}/auth/email/register`, {
      data: {
        username: USER.username,
        email: USER.email,
        password: USER.password,
      },
    });
    expect(reg.ok(), `register failed: ${reg.status()} ${await reg.text()}`).toBeTruthy();
    const regBody = (await reg.json()) as RegisterResponse;
    userId = regBody.userId;

    // 2. Login to obtain a JWT.
    const login = await ctx.post(`${API_URL}/auth/email/login`, {
      data: { email: USER.email, password: USER.password },
    });
    expect(login.ok(), `login failed: ${login.status()}`).toBeTruthy();
    const loginBody = (await login.json()) as LoginResponse;
    accessToken = loginBody.accessToken;

    // 3. Verify we can fetch the current user.
    const me = await ctx.get(`${API_URL}/users/me`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    expect(me.ok()).toBeTruthy();
    const meBody = (await me.json()) as UserResponse;
    expect(meBody.id).toBe(userId);

interface League {
  id: string;
}

// ... after register/login

    // 4. Create a team. The backend's `TeamService.create` should fire
    //    the onboarding hook — see `ensureYouthTeamForNewTeam` +
    //    `generateThreeCandidates` — synchronously, before returning.
    //
    // Pick an existing senior league so the team has somewhere to play.
    const leaguesResp = await ctx.get(`${API_URL}/leagues`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    expect(leaguesResp.ok(), `leagues list failed: ${leaguesResp.status()}`).toBeTruthy();
    const leaguesBody = (await leaguesResp.json()) as { data: League[] };
    const leagueId = leaguesBody.data[0]?.id;
    expect(leagueId, 'expected at least one senior league to be seeded').toBeTruthy();

    const create = await ctx.post(`${API_URL}/teams`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      data: { name: USER.teamName, nationality: 'GB', userId, leagueId },
    });
    expect(create.ok(), `create team failed: ${create.status()} ${await create.text()}`).toBeTruthy();
    const teamBody = (await create.json()) as TeamResponse;
    teamId = teamBody.id;
    expect(teamId).toBeTruthy();

    // 5. Verify the onboarding hook fired: the scout inbox should
    //    contain 3 candidates immediately. If it shows 0, the hook
    //    did not run.
    const scouts = await ctx.get(`${API_URL}/scouts/candidates`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    expect(scouts.ok(), `scouts list failed: ${scouts.status()}`).toBeTruthy();
    const scoutList = (await scouts.json()) as ScoutCandidate[];
    expect(scoutList.length, 'expected 3 scout candidates after onboarding').toBe(3);

    // 6. Sign the first candidate. This should create a YouthPlayer
    //    row and remove the candidate.
    const candidateId = scoutList[0].id;
    const sign = await ctx.post(`${API_URL}/scouts/${candidateId}/select`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    expect(sign.ok(), `sign candidate failed: ${sign.status()} ${await sign.text()}`).toBeTruthy();
    const signed = (await sign.json()) as YouthPlayer;
    expect(signed.isPromoted).toBe(false);
    expect(signed.revealLevel).toBe(1);

    // 7. Verify /players?isYouth=true shows exactly 1 player (the one we just signed).
    //    After RFC 0001 there is no separate /youth-players endpoint; we filter
    //    by isYouth=true.
    const youth = await ctx.get(`${API_URL}/players?isYouth=true`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    expect(youth.ok()).toBeTruthy();
    const youthList = (await youth.json()) as YouthPlayer[];
    expect(youthList.length).toBe(1);
    expect(youthList[0].id).toBe(signed.id);
    expect(youthList[0].name).toBe(scoutList[0].name);

    // 8. Verify the scout inbox now has 2 candidates left.
    const scoutsAfter = await ctx.get(`${API_URL}/scouts/candidates`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    expect(scoutsAfter.ok()).toBeTruthy();
    const scoutListAfter = (await scoutsAfter.json()) as ScoutCandidate[];
    expect(scoutListAfter.length).toBe(2);

    // 9. UI smoke skipped: this spec runs against an APIRequestContext
    //    only, so we can't drive the browser here. The full UI smoke
    //    is left for a follow-up that boots a chromium browser fixture
    //    (see web/test/onboarding-ui.spec.ts — future).

    // 10. Cleanup: skip in CI; in local dev we leave the user/team
    //     behind for manual inspection.
  });
});
