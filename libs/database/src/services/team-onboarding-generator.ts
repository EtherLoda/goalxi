import { EntityManager } from 'typeorm';
import {
  FanEntity,
  FinanceEntity,
  PlayerEntity,
  StaffEntity,
  StaffLevel,
  StaffRole,
  StadiumEntity,
} from '../index';
import { getRandomNameByNationality, getRandomNationality } from '../constants/name-database';
import { currentGameDay } from '../utils/game-clock';
import { GAME_SETTINGS } from '../constants/game.constants';

/**
 * Default squad size for a freshly claimed team. The original
 * `TeamService.create` (api) also uses 18 — keep the two in
 * lockstep so a manager-created team and an onboarding-claimed
 * team look the same on the squad page.
 */
export const ONBOARDING_SQUAD_SIZE = 18;

/**
 * Age band (inclusive) for players on a freshly claimed
 * squad. The previous version set `createdDay = currentGameDay()`
 * for every new player, which collapses every age to 0
 * (the `PlayerEntity.getExactAge()` getter is
 * `floor((currentGameDay - createdDay) / DAYS_PER_YEAR)`).
 * 18..30 covers a believable mix of "raw rookie through
 * experienced pro" — the kinds of players a club on the
 * bottom tier of the pyramid can realistically assemble on
 * day 1. Veterans above 30 are deliberately excluded so the
 * new manager has meaningful "youth → prime → veteran"
 * development runway over the first few seasons.
 */
export const ONBOARDING_PLAYER_AGE_MIN = 18;
export const ONBOARDING_PLAYER_AGE_MAX = 30;

/**
 * Starting balance the new manager wakes up with. Enough to
 * cover two-three weeks of senior wages for the 18-player
 * squad (~36k/wk all-in for REGULAR/HIGH_PRO rookies) plus
 * the stadium upkeep, so the first matchday isn't a "sell
 * someone to make payroll" emergency. The exact value is a
 * balance knob, not a hard requirement — the user-facing copy
 * on the dashboard should reflect whatever this constant is.
 */
export const ONBOARDING_STARTING_BALANCE = 500_000;

/**
 * Starting fan base for a new manager. 10k — not zero. The
 * ticket-revenue formula (`fans * 0.2 * morale_rate`) and the
 * sponsorship formula (`base * 2 * sqrt(fans/10000)`) both
 * scale off `totalFans`, so a 0-fan start means W1 income is
 * 0 across the board and the team bleeds out before fan
 * growth can kick in. 10k is the smallest base that gives
 * the L4 sponsor baseline a 1.0× multiplier (so the new
 * manager's first week's sponsorship = 80k, not 0) and a
 * 1600-attendance opener (≈35k ticket revenue). The new
 * club isn't a tabula rasa — every fresh team in real life
 * inherits a city and a few thousand regulars, and the
 * 0-fan design was over-correcting for "neutral fans don't
 * exist" (a separate code concern, see
 * `fan.service.ts:calculateAttendance`).
 */
export const ONBOARDING_STARTING_FANS = 10_000;

/**
 * Starting stadium capacity for a new manager. 10k seats —
 * a small but serviceable stadium that lets the new club
 * host a couple of home fixtures without being immediately
 * outgrown. The stadium-construction system lets the manager
 * expand it later.
 */
export const ONBOARDING_STARTING_STADIUM_CAPACITY = 10_000;

/**
 * Default nationality fallback when a team has no `nationality`
 * set (e.g. the BOT slot in L1 was generated without one). The
 * generator falls back to CN — matches the same fallback in
 * `ScoutsService` and `TeamService.create`.
 */
const DEFAULT_TEAM_NATIONALITY = 'CN';

/**
 * Default club name used when the registration form is
 * submitted without a `teamName` (or with whitespace only).
 * Pure safety net for tests and headless scripted flows — the
 * frontend register form makes the field required, so this
 * string should never surface for a real manager.
 */
export const DEFAULT_TEAM_NAME = 'New Club';

/**
 * Random-skill matrix for a fresh player. Mirrors the api-side
 * `PlayerService.generateRandomSkills` — extracted here so
 * settlement's `OnboardingProcessor` (which only imports from
 * `@goalxi/database`) can build a starter squad without taking
 * a dependency on the api/ workspace.
 *
 * The two implementations are intentionally identical so a
 * manager-created team and an onboarding-claimed team are
 * indistinguishable downstream.
 *
 * The cast through `unknown` at the end is the same shape
 * bridge `senior-scout-generator` uses — `PlayerSkills` is a
 * closed union (`OutfieldTechnical | GKTechnical`) and TS
 * can't narrow it from a dynamically-keyed map, but the
 * runtime values match the closed shapes. The cast is the
 * smallest escape hatch.
 */
function generateRandomSkills(isGoalkeeper: boolean): {
  currentSkills: PlayerEntity['currentSkills'];
  potentialSkills: PlayerEntity['potentialSkills'];
} {
  const rand = (min: number, max: number) =>
    Number((Math.random() * (max - min) + min).toFixed(2));

  const createPhysical = () => ({
    pace: rand(isGoalkeeper ? 5 : 10, 20),
    strength: rand(5, 20),
  });

  const createTechnicalGK = () => ({
    reflexes: rand(10, 20),
    handling: rand(10, 20),
    aerial: rand(5, 18),
    positioning: rand(10, 20),
  });

  const createTechnicalOutfield = () => ({
    finishing: rand(5, 20),
    passing: rand(5, 20),
    dribbling: rand(5, 20),
    defending: rand(5, 20),
  });

  const createMental = () => ({
    vision: rand(5, 20),
    positioning: rand(5, 20),
    awareness: rand(5, 20),
    composure: rand(5, 20),
    aggression: rand(5, 20),
  });

  const currentPhysical = createPhysical();
  const currentTechnical = isGoalkeeper
    ? createTechnicalGK()
    : createTechnicalOutfield();
  const currentMental = createMental();

  // Potential = current + 0..5 per attribute, so every new
  // player has SOME growth headroom — the new manager
  // immediately has players to train rather than a flat ceiling.
  const bump = (cur: Record<string, number>): Record<string, number> => {
    const out: Record<string, number> = {};
    for (const k of Object.keys(cur)) {
      out[k] = Math.max(cur[k], cur[k] + rand(0, 5));
    }
    return out;
  };

  const currentSkills = {
    physical: currentPhysical,
    technical: currentTechnical,
    mental: currentMental,
    setPieces: { freeKicks: 10, penalties: 10 },
  } as unknown as PlayerEntity['currentSkills'];
  const potentialSkills = {
    physical: bump(currentPhysical),
    technical: bump(currentTechnical as unknown as Record<string, number>),
    mental: bump(currentMental),
    setPieces: { freeKicks: 10, penalties: 10 },
  } as unknown as PlayerEntity['potentialSkills'];
  return { currentSkills, potentialSkills };
}

/**
 * Mirror of `PlayerService.calculatePotentialAbility` from the
 * api/. Kept private here so the generator can stamp a sane PA
 * on each new row without pulling in a service.
 */
function calculatePotentialAbility(
  skills: PlayerEntity['potentialSkills'],
): number {
  if (!skills) return 50;
  const physical = skills.physical as unknown as Record<string, number>;
  const technical = skills.technical as unknown as Record<string, number>;
  const mental = skills.mental as unknown as Record<string, number>;
  const setPieces = skills.setPieces as unknown as Record<string, number>;

  const physicalSum = Object.values(physical).reduce((a, b) => a + b, 0);
  const technicalSum = Object.values(technical).reduce((a, b) => a + b, 0);
  const mentalSum = Object.values(mental).reduce((a, b) => a + b, 0);
  const setPiecesSum = Object.values(setPieces).reduce((a, b) => a + b, 0);

  const rawPA =
    physicalSum * 1 +
    technicalSum * 1 +
    mentalSum * 0.4 +
    setPiecesSum * 0.1;
  const maxRaw = 140;
  return Math.min(100, Math.max(0, Math.round((rawPA / maxRaw) * 100)));
}

/**
 * Wipe every "manager-controlled" row off a team. Called from
 * the onboarding claim so a new manager inherits a clean slate
 * (no players, no staff, no scout inbox, no per-matchday
 * tactics) while keeping the season-progress rows (match
 * results, league standing, …) intact.
 *
 * Why soft-delete for `player` and hard-delete for the rest:
 *
 *   - `match_event.player_id` is FK to `player.id` with
 *     `ON DELETE CASCADE`. Hard-deleting a player would erase
 *     that player's match events — losing the season's
 *     scorers/assists/tackles. Soft-delete via the
 *     `@DeleteDateColumn` on `PlayerEntity` keeps the row
 *     visible to historical queries but hides it from the
 *     active squad list (every squad query already filters
 *     `deletedAt IS NULL`).
 *
 *   - The other tables (`match_tactics`, `staff`,
 *     `scout_candidate`, …) are not referenced by any
 *     historical table, so a hard delete is safe.
 *
 * `match_tactics` is wiped because it's the new manager's
 * per-matchday decision; a leftover BOT tactic on an
 * upcoming fixture would lock the manager out of editing it.
 *
 * `tactics_preset` is wiped because presets are a
 * personal-curation surface, not a season artefact.
 *
 * `stadium_construction` is wiped because a half-built
 * stadium the BOT started but the new manager never approved
 * would feel like a tax on day one.
 *
 * `training_update` is wiped because the cooldown is
 * per-team and the new manager should not be locked out of
 * the first 7 days of training changes by a decision the
 * BOT made.
 *
 * `finance` / `fan` / `stadium` are wiped because the new
 * manager starts on a clean budget (500k), a 10k-fan
 * baseline (see `ONBOARDING_STARTING_FANS` for why zero
 * is death), and a fresh 10k-seat stadium — see the
 * matching `generateTeamFinance` / `generateTeamFan` /
 * `generateTeamStadium` helpers below for the seeds. Wiping
 * the inherited rows is required because each table has a
 * `OneToOne`-style unique relationship with `team` (the
 * bot already has a `finance` row, so the seed-time
 * `manager.create` would conflict on the team_id PK).
 *
 * `injury` and `coach_player_assignment` are NOT explicitly
 * deleted here — they have no `team_id` column, only FKs to
 * `player` and/or `staff`. After the soft-delete of players
 * + hard-delete of staff, every row in these two tables
 * referencing the team's previous roster is orphaned, and
 * the squad UI already filters them out (it joins through
 * `player` which is hidden). Leaving them in place keeps the
 * FK chain from `player_history` / archived tables valid for
 * historical match-event reconstruction.
 *
 * `player_transaction` and `transfer_transaction` are not
 * keyed by `team_id` directly — they use `from_team_id` and
 * `to_team_id` — so we issue a custom `WHERE from_team_id = $1
 * OR to_team_id = $1` for each.
 *
 * Idempotent: a second call on a clean team is a no-op.
 */
export async function scrubManagerSpecificData(
  manager: EntityManager,
  teamId: string,
): Promise<void> {
  // 1. Soft-delete all live players — preserves FKs to historical
  //    match_event / player_event / player_competition_stats.
  await manager
    .createQueryBuilder()
    .update(PlayerEntity)
    .set({ deletedAt: () => 'NOW()' })
    .where('team_id = :teamId', { teamId })
    .andWhere('deleted_at IS NULL')
    .execute();

  // 2. Hard-delete the manager-controlled rows. All keyed by
  //    `team_id` (verified via information_schema before the
  //    change landed — see the comment block on
  //    `injury`/`coach_player_assignment` for why those two
  //    are deliberately skipped).
  //
  // Why raw `manager.query` instead of `manager.delete(Entity, …)`:
  // TypeORM 0.3.x has a known bug where `manager.delete(Entity,
  // criteria)` and `createQueryBuilder().delete().from(Entity)`
  // both dispatch through `DeleteQueryBuilder.from()` which
  // calls a non-existent `this.subQuery` in 0.3.27
  // (typeorm/typeorm#9367). Raw `manager.query` bypasses the
  // buggy builder entirely. All queries are parameterized —
  // no SQL-injection risk.
  await manager.query(`DELETE FROM staff WHERE team_id = $1`, [teamId]);
  await manager.query(`DELETE FROM match_tactics WHERE team_id = $1`, [teamId]);
  await manager.query(`DELETE FROM scout_candidate WHERE team_id = $1`, [teamId]);
  await manager.query(`DELETE FROM auction WHERE team_id = $1`, [teamId]);
  await manager.query(`DELETE FROM stadium_construction WHERE team_id = $1`, [teamId]);
  await manager.query(`DELETE FROM tactics_preset WHERE team_id = $1`, [teamId]);
  await manager.query(`DELETE FROM training_update WHERE team_id = $1`, [teamId]);
  await manager.query(`DELETE FROM finance WHERE team_id = $1`, [teamId]);
  await manager.query(`DELETE FROM fan WHERE team_id = $1`, [teamId]);
  await manager.query(`DELETE FROM stadium WHERE team_id = $1`, [teamId]);

  // 3. The two inter-team transaction tables don't have a
  //    `team_id` column — they use `from_team_id` /
  //    `to_team_id`.
  await manager.query(
    `DELETE FROM player_transaction WHERE from_team_id = $1 OR to_team_id = $1`,
    [teamId],
  );
  await manager.query(
    `DELETE FROM transfer_transaction WHERE from_team_id = $1 OR to_team_id = $1`,
    [teamId],
  );
}

/**
 * Generate a starter squad of N players for the given team.
 *
 * Defaults to `ONBOARDING_SQUAD_SIZE` (18) so the caller can
 * pass nothing for the standard "fresh manager" case. The
 * generator:
 *
 *   - picks a random name per the team's nationality (or a
 *     random nationality if the team has none — same fallback
 *     as the rest of the codebase);
 *   - 10% chance of goalkeeper, otherwise outfield;
 *   - stamps `currentSkills` + `potentialSkills` with the same
 *     random ranges the api-side `PlayerService.generateRandom`
 *     uses, so the two paths produce indistinguishable squads;
 *   - sets `createdDay` to the current game day so age math
 *     lines up with the rest of the season.
 *
 * All inserts go through the supplied `EntityManager` so the
 * squad creation rides inside the onboarding claim's
 * transaction. If the transaction rolls back the players roll
 * back with it.
 */
export async function generateTeamSquad(
  manager: EntityManager,
  teamId: string,
  nationality: string | null,
  count: number = ONBOARDING_SQUAD_SIZE,
): Promise<PlayerEntity[]> {
  const teamNationality = nationality ?? DEFAULT_TEAM_NATIONALITY;
  const today = currentGameDay();
  const daysPerYear = GAME_SETTINGS.DAYS_PER_YEAR;
  const players: PlayerEntity[] = [];

  for (let i = 0; i < count; i++) {
    // Allow per-player nationality variance (more fun than a
    // mono-national squad) but bias to the team's own so
    // the squad feels like a real club.
    const playerNationality = Math.random() < 0.7
      ? teamNationality
      : getRandomNationality();
    const { firstName, lastName } =
      getRandomNameByNationality(playerNationality);
    const isGoalkeeper = Math.random() < 0.1;
    const { currentSkills, potentialSkills } =
      generateRandomSkills(isGoalkeeper);
    const potentialAbility = calculatePotentialAbility(potentialSkills);
    // `createdDay` is the offset-from-today anchor for the
    // `PlayerEntity.getExactAge()` math
    // (`floor((currentGameDay - createdDay) / DAYS_PER_YEAR)`).
    // An age of N means the player was "born" N*DAYS_PER_YEAR
    // days before today. Bias the distribution toward the
    // 22..26 sweet spot — most squad rosters lean prime-age,
    // with fewer raw rookies and fewer veterans.
    const ageRoll = Math.random();
    const age =
      ageRoll < 0.25
        ? ONBOARDING_PLAYER_AGE_MIN + Math.floor(Math.random() * 3) // 18..20
        : ageRoll < 0.85
          ? 22 + Math.floor(Math.random() * 5)                       // 22..26
          : 27 + Math.floor(Math.random() * 4);                      // 27..30
    // Random `daysAlive` offset within the year so the squad
    // doesn't all have perfectly round ages (the player
    // entity's `getExactAge()` getter returns `[years, days]`
    // — without this offset every new player would show up
    // as "23y 0d" which reads as obviously synthetic). Range
    // 0..DAYS_PER_YEAR-1 inclusive so the displayed age is
    // always strictly less than the next integer year.
    const daysAliveInYear = Math.floor(Math.random() * daysPerYear);
    const createdDay = today - age * daysPerYear - daysAliveInYear;

    const player = manager.create(PlayerEntity, {
      teamId,
      name: `${firstName} ${lastName}`,
      nationality: playerNationality,
      createdDay,
      isGoalkeeper,
      isYouth: false,
      youthLeagueId: null,
      revealLevel: 0,
      revealedSkills: [],
      potentialRevealed: true,
      onTransfer: false,
      currentSkills,
      potentialSkills,
      potentialAbility,
      // `experience` is a soft "years-of-pro-football" hint used
      // by the simulator; pair it with `age` so a 28-year-old
      // has more experience than an 18-year-old on day 1.
      experience: 0.5 + Math.random() * 2.5 + Math.max(0, age - 20) * 0.4,
      form: 3,
      stamina: 3,
      matchMinutes: 0,
      currentWage: 2000 + Math.floor(Math.random() * 3000) + age * 100,
    });
    players.push(await manager.save(player));
  }
  return players;
}

/**
 * Generate the two default coaching staff rows that every
 * freshly claimed team needs to function (a head coach for
 * the matchday-11 and a fitness coach for stamina recovery).
 *
 * Salary and contract length mirror the api-side
 * `TeamService.create` defaults. The 16-week contract is long
 * enough that a manager who doesn't touch the staff page for
 * a while doesn't get an instant staff crisis.
 *
 * Both rows go through the supplied `EntityManager` so they
 * ride the onboarding transaction.
 */
export async function generateTeamStaff(
  manager: EntityManager,
  teamId: string,
  nationality: string | null,
): Promise<StaffEntity[]> {
  const teamNationality = nationality ?? DEFAULT_TEAM_NATIONALITY;
  const contractExpiry = new Date(
    Date.now() + 16 * 7 * 24 * 60 * 60 * 1000,
  );

  const head = getRandomNameByNationality(teamNationality);
  const fitness = getRandomNameByNationality(teamNationality);

  const headCoach = manager.create(StaffEntity, {
    teamId,
    name: `${head.firstName} ${head.lastName}`,
    role: StaffRole.HEAD_COACH,
    level: StaffLevel.LEVEL_2,
    salary: 4000,
    contractExpiry,
    autoRenew: true,
    isActive: true,
    nationality: teamNationality,
  });
  const fitnessCoach = manager.create(StaffEntity, {
    teamId,
    name: `${fitness.firstName} ${fitness.lastName}`,
    role: StaffRole.FITNESS_COACH,
    level: StaffLevel.LEVEL_2,
    salary: 2000,
    contractExpiry,
    autoRenew: true,
    isActive: true,
    nationality: teamNationality,
  });
  return manager.save([headCoach, fitnessCoach]);
}

/**
 * Create a fresh `finance` row for the newly claimed team with
 * the `ONBOARDING_STARTING_BALANCE` seed. The pre-scrub inherited
 * row is wiped (see `scrubManagerSpecificData`) because the
 * `finance` table is a `OneToOne`-style unique-per-team
 * relationship — the new manager's row would otherwise
 * conflict on `team_id` at insert time.
 *
 * The Finance scheduler (`settlement/src/scheduler/finance-scheduler.service.ts`)
 * reads `team_id` and `balance` from this row each tick, so
 * the shape and column names here must stay in lockstep with
 * `FinanceEntity`.
 */
export async function generateTeamFinance(
  manager: EntityManager,
  teamId: string,
): Promise<FinanceEntity> {
  const row = manager.create(FinanceEntity, {
    teamId,
    balance: ONBOARDING_STARTING_BALANCE,
  });
  return manager.save(row);
}

/**
 * Create a fresh `fan` row with `ONBOARDING_STARTING_FANS`
 * (10k — see the constant's doc for why zero is death)
 * and a neutral fan emotion (50/100 — "观望" tier).
 * The pre-scrub inherited row is wiped for the same
 * OneToOne conflict reason as `generateTeamFinance`.
 *
 * `recentForm` is left as the default empty string — the new
 * manager hasn't played any matches yet, so "WWDLL" would be
 * a lie.
 */
export async function generateTeamFan(
  manager: EntityManager,
  teamId: string,
): Promise<FanEntity> {
  const row = manager.create(FanEntity, {
    teamId,
    totalFans: ONBOARDING_STARTING_FANS,
    fanEmotion: 50,
    recentForm: '',
  });
  return manager.save(row);
}

/**
 * Create a fresh `stadium` row with the
 * `ONBOARDING_STARTING_STADIUM_CAPACITY` (10k) seat count.
 * The stadium is marked `isBuilt = true` so the new manager
 * can host home matches on day 1 — a half-built stadium
 * would block the first home fixture and force the manager
 * to wait out a construction timer they didn't sign up for.
 *
 * Name is the entity default ("Home Stadium") — a future
 * stadium-rename UI can let the manager pick their own.
 */
export async function generateTeamStadium(
  manager: EntityManager,
  teamId: string,
): Promise<StadiumEntity> {
  const row = manager.create(StadiumEntity, {
    teamId,
    capacity: ONBOARDING_STARTING_STADIUM_CAPACITY,
    isBuilt: true,
  });
  return manager.save(row);
}
