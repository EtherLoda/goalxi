/**
 * Scout Onboarding Smoke Test
 *
 * Validates the full onboarding baseline: from a brand-new user we can
 * register, claim a team, see the onboarding hook seed scout candidates,
 * sign one, and see it land on the SENIOR roster. Runs against a live api
 * server.
 *
 * ## Why it is not called "youth" any more
 *
 * Scout discovery is the only way a new player enters the world.
 * `ScoutsService.selectCandidate` signs a player straight into the senior
 * squad with `isYouth = false` and `youthLeagueId = null` — there is no
 * academy to graduate them through. The `/youth/*` routes, the promote
 * endpoint and the youth progression worker have all been removed, so
 * this spec no longer touches any of them.
 *
 * ## Pre-conditions
 *
 *   - api server is up on http://localhost:3000
 *   - The database has been reset (or the user/team identifiers below
 *     are randomized per run).
 *
 * NOTE: this spec needs a live API, so it is NOT part of `pnpm test`
 * (which is Playwright and expects a running stack). That is why its
 * step-7 assertion could rot unnoticed: it asserted
 * `GET /players?isYouth=true` returned exactly 1 player, which stopped
 * being true the moment scouts switched to senior-mode signing. If you
 * change the onboarding or signing flow, run this spec — nothing else
 * in CI will catch a regression here.
 */

import { test, expect, request } from '@playwright/test';

const API_URL = 'http://localhost:3000/api/v1';

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

interface SignedPlayer {
  id: string;
  name: string;
  isGoalkeeper: boolean;
  isPromoted: boolean;
  revealLevel: number;
  revealedSkills: string[];
}

/** A player row as returned by `GET /players?teamId=`. */
interface RosterPlayer {
  id: string;
  name: string;
  isYouth: boolean;
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

    // 6. Sign the first candidate. This creates a senior player row and
    //    removes the candidate from the inbox.
    const candidateId = scoutList[0].id;
    const sign = await ctx.post(`${API_URL}/scouts/${candidateId}/select`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    expect(sign.ok(), `sign candidate failed: ${sign.status()} ${await sign.text()}`).toBeTruthy();
    const signed = (await sign.json()) as SignedPlayer;
    expect(signed.isPromoted).toBe(false);
    expect(signed.revealLevel).toBe(1);

    // 7. Verify the signed player is on the SENIOR roster.
    //
    //    This used to assert `GET /players?isYouth=true` returned exactly
    //    1 player. That stopped being true when scout discovery switched to
    //    senior-mode signing: `ScoutsService.selectCandidate` creates the
    //    player with `isYouth = false` and `youthLeagueId = null`, because
    //    there is no youth pipeline to graduate them through. Nothing in
    //    the codebase creates `isYouth = true`, so that list is always
    //    empty and the assertion could only fail — it just never ran,
    //    since this spec needs a live API and is not part of `pnpm test`.
    const teamPlayers = await ctx.get(
      `${API_URL}/players?teamId=${teamId}`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    expect(teamPlayers.ok()).toBeTruthy();
    const roster = (await teamPlayers.json()) as { items: RosterPlayer[] };
    const signedOnRoster = roster.items.find((p) => p.id === signed.id);
    expect(
      signedOnRoster,
      `signed player ${signed.id} missing from the senior roster`,
    ).toBeTruthy();
    expect(signedOnRoster!.isYouth).toBe(false);

    // The youth filter is kept honest: it must return nothing rather than
    // silently claiming a youth pipeline exists.
    const youth = await ctx.get(`${API_URL}/players?isYouth=true`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    expect(youth.ok()).toBeTruthy();
    const youthList = (await youth.json()) as { items: unknown[] };
    expect(youthList.items).toHaveLength(0);

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
