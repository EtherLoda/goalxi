import { EntityManager } from 'typeorm';
import {
  FanEntity,
  FinanceEntity,
  LeagueStandingEntity,
  PlayerEntity,
  StaffEntity,
  StaffLevel,
  StaffRole,
  StadiumEntity,
  TeamEntity,
} from '../index';
import { getRandomNameByNationality } from '../constants/name-database';
import { currentGameDay } from '../utils/game-clock';
import { GAME_SETTINGS } from '../constants/game.constants';
import { rollSpecialty } from './specialty-generator';
import type { Uuid } from '../types/common.type';

// ============================================================
// Constants — single source of truth for "what a team looks
// like" across every entry point (bootstrap, onboarding,
// scheduler, dev seed).
// ============================================================

/**
 * Total squad size for every freshly generated team. 2 GK + 14
 * outfield. Lifted out of the previous bot-only (16) and
 * manager-only (18) split — the user explicitly wants a single
 * roster shape so a manager's first squad and the BOT they
 * eventually replace look identical in size and position layout.
 */
export const TEAM_SQUAD_SIZE = 16;
export const TEAM_GK_COUNT = 2;
export const TEAM_OUTFIELD_COUNT = 14;

/**
 * Position distribution for the 16-player squad. Two strikers
 * (CF×2) and four central mids (CM×4) keep the squad
 * tactically flexible — most 4-4-2 / 4-2-3-1 / 3-5-2 shapes
 * line up against this without scrambling the bench.
 */
export const TEAM_POSITION_DISTRIBUTION: Record<string, number> = {
  GK: 2,
  // Squad-distribution key: was 'CD' (legacy 1-slot centre-defender),
  // renamed to the 3-slot centre-back key. `attribute-calculator`'s
  // `SLOT_KEY_NORMALIZER` already folded `CD` to `CB`, so this is a
  // pure source-cleanup that drops a normalisation hop at runtime.
  CB: 2,
  LB: 1,
  RB: 1,
  CM: 4,
  // `DM` and `AM` are now the 3-slot centre keys (renamed from the
  // 1-slot names in commit 2). The squad weight (1 each) is the
  // squad share, not a per-slot weight — generator still picks one
  // player per slot from the available `positionArchetype` table.
  DM: 1,
  AM: 1,
  LW: 1,
  RW: 1,
  CF: 2,
};

/**
 * OVR range for any newly generated team — both bot and
 * manager. 25-40 OVR = "rookie to amateur" tier; deliberately
 * weak so player growth feels meaningful over the first few
 * seasons, and so the top-tier BOT pyramid isn't an immediate
 * buzzsaw for L4 managers climbing the ladder.
 *
 * Per-player target OVR is `randomInt(min, max)` and the skill
 * generator derives a skillBase from that, so the realized OVR
 * lands within ±2 of the target (controlled by the position
 * template's primary/secondary/tertiary boost pattern).
 */
export const DEFAULT_OVR_MIN = 25;
export const DEFAULT_OVR_MAX = 40;

/**
 * Age band (inclusive) for a freshly generated player. 18..30
 * covers raw rookies through prime-age pros — exactly the kind
 * of squad a bottom-tier club can realistically assemble on
 * day 1. Anything older is intentionally excluded so the new
 * manager has meaningful "youth → prime → veteran" growth
 * runway over the first few seasons.
 */
export const DEFAULT_PLAYER_AGE_MIN = 18;
export const DEFAULT_PLAYER_AGE_MAX = 30;

/**
 * Starting balances. Bots are given a fat 5M war chest so
 * they can run a full season without going bankrupt on wages
 * (the auto-finance scheduler doesn't top up BOT teams
 * aggressively). Managers get a tighter 500k — enough to cover
 * 2-3 weeks of senior wages + stadium upkeep so the first
 * matchday isn't a "sell someone to make payroll" emergency,
 * but tight enough that reckless spending bites.
 */
export const BOT_STARTING_BALANCE = 5_000_000;
export const MANAGER_STARTING_BALANCE = 500_000;

/**
 * Starting fan base. Bots seed 5k — enough to register on the
 * sponsor baseline but not so much that an L1 BOT looks like a
 * major club. Managers seed 10k so a freshly-claimed team's
 * first week of sponsorship and ticket revenue is non-zero
 * (the formulas scale off `totalFans` and a 0-fan start means
 * W1 income is 0 across the board).
 */
export const BOT_STARTING_FANS = 5_000;
export const MANAGER_STARTING_FANS = 10_000;

/**
 * Starting stadium capacity. 10k seats for both — a small but
 * serviceable stadium that lets the new club host a couple of
 * home fixtures without being immediately outgrown. The
 * stadium-construction system lets the owner expand it later.
 */
export const DEFAULT_STADIUM_CAPACITY = 10_000;

/**
 * Default club name used when the registration form is
 * submitted without a `teamName` (or with whitespace only).
 * Pure safety net for tests and headless scripted flows — the
 * frontend register form makes the field required, so this
 * string should never surface for a real manager.
 */
export const DEFAULT_TEAM_NAME = 'New Club';

/**
 * Default nationality fallback when a team has no `nationality`
 * set (e.g. the BOT slot in L1 was generated without one).
 * Falls back to CN — matches the same fallback in
 * `ScoutsService` and `TeamService.create`.
 */
const DEFAULT_TEAM_NATIONALITY = 'CN';

/**
 * Default bot level for newly created BOT teams. Mirrors the
 * previous bootstrap + scheduler default. Manager-owned teams
 * ignore this and write `5` so any future read doesn't see a
 * stale BOT-era value.
 */
const DEFAULT_BOT_LEVEL = 5;

/**
 * Default season number stamped onto a freshly inserted
 * `league_standing` row. Season 1 = the first season the
 * database ever ran. Bumped by the season-end scheduler
 * post-game.
 */
const DEFAULT_STANDING_SEASON = 1;

// ============================================================
// Public types
// ============================================================

/**
 * Params for `createTeam`. Designed to be the single canonical
 * "make a team" call. The behavioural differences between
 * bootstrap (fresh insert, isBot) and onboarding (existing
 * teamId, ownership flip) are expressed entirely as field
 * values, not separate code paths.
 */
export interface CreateTeamParams {
  /** League id the team belongs to. Required so we can stamp
   *  `leagueId` (insert) and create a `league_standing` row.
   *  We take the id rather than the full `LeagueEntity` so
   *  callers that already have the id in hand
   *  (`OnboardingAssigner` reads it off the picked team) don't
   *  need a second round-trip. */
  leagueId: Uuid;
  /** Club name. Always written; for onboarding this is the
   *  user-supplied name (or `DEFAULT_TEAM_NAME`). */
  name: string;
  /** ISO 3166-1 alpha-2 country code. Falls back to
   *  `DEFAULT_TEAM_NATIONALITY` when missing. */
  nationality: string;
  /** `true` for a BOT team, `false` for a manager-owned team.
   *  Drives: `isBot` flag, `botLevel`, starting balance,
   *  starting fans. */
  isBot: boolean;
  /** The owning user id. For BOT teams this is `null` — bot
   *  teams are not owned by anyone (the design pre-init had
   *  a fake `bot_manager` user as the owner, which we dropped
   *  because bot teams shouldn't have a user account behind
   *  them). For manager-owned teams (onboarding claim,
   *  scheduler spawn, `seed-main.ts`) this is the manager's
   *  user id. Nullable so the entity's `userId: string | null`
   *  contract is honoured. */
  userId: string | null;
  /**
   * When set, update the existing team row instead of
   * inserting. Used by onboarding so the `team.id` is
   * preserved (match_event, match, league_standing, … all
   * FK to `team.id` and a fresh UUID would orphan every
   * historical reference). The row's `id`, `leagueId`,
   * `shortCode`, jersey colors, and `deletedAt` are
   * intentionally not touched.
   */
  existingTeamId?: Uuid;
  /** Bot strength (1-10). Only written when `isBot: true`.
   *  Defaults to `DEFAULT_BOT_LEVEL`. */
  botLevel?: number;
  /** OVR range override. Defaults to
   *  `DEFAULT_OVR_MIN`..`DEFAULT_OVR_MAX` (25-40). */
  ovrMin?: number;
  ovrMax?: number;
  /** Season number for the new `league_standing` row.
   *  Defaults to 1. */
  season?: number;
  /** Optional short code (5-char). If omitted, the entity
   *  default applies. The caller (e.g. `seed-main.ts`)
   *  generates one ahead of time when uniqueness matters. */
  shortCode?: string;
}

export interface CreatedTeam {
  team: TeamEntity;
  players: PlayerEntity[];
  staff: StaffEntity[];
}

// ============================================================
// Public entry point
// ============================================================

/**
 * The single canonical "make a team" function. Used by:
 *
 *   1. `TeamGenerator` in `bootstrap/team-generator.ts` to
 *      populate the 85+ BOT pyramid at game init.
 *   2. `OnboardingAssigner.claim` to convert a BOT into a
 *      manager-owned team (passes `existingTeamId`).
 *   3. `TeamGeneratorService.createTeam` in the scheduler
 *      (reserved for future use — currently no live caller).
 *   4. `seed-main.ts` for dev / test users.
 *
 * All callers pass the same shape; the only thing that varies
 * is `isBot` and (for onboarding) `existingTeamId`. Inside
 * this function:
 *
 *   - team row is upserted (insert or update, preserving
 *     `team.id` in the update case);
 *   - every manager-controlled child is wiped (soft-delete
 *     for players so `match_event` FKs stay valid; hard
 *     delete for the rest);
 *   - 16 players are generated (2 GK + 14 outfield, positions
 *     per `TEAM_POSITION_DISTRIBUTION`), each with a v2
 *     `coreSpecialty` / `coreSpecialtyTier` (5/15/30/50
 *     distribution, position-agnostic);
 *   - head coach + fitness coach staff rows;
 *   - finance / fan / stadium rows (starting values differ
 *     for BOT vs manager);
 *   - a `league_standing` row (season 1, position 0).
 *
 * All writes go through the supplied `EntityManager` so the
 * whole sequence rides inside the caller's transaction
 * (bootstrap calls this in a loop without an explicit
 * transaction; onboarding wraps it in a `dataSource.transaction`
 * to keep pick + claim + regenerate atomic).
 */
export async function createTeam(
  manager: EntityManager,
  params: CreateTeamParams,
): Promise<CreatedTeam> {
  const ovrMin = params.ovrMin ?? DEFAULT_OVR_MIN;
  const ovrMax = params.ovrMax ?? DEFAULT_OVR_MAX;

  // 1. Upsert team row.
  const team = await upsertTeam(manager, params);

  // 2. Wipe every manager-controlled child so a re-create
  //    starts clean. Idempotent on a fresh team.
  await scrubManagerSpecificData(manager, team.id);

  // 3. Generate 16 players (2 GK + 14 outfield), with v2
  //    specialty and OVR in [ovrMin, ovrMax].
  const players = await generateTeamSquad(manager, team.id, {
    nationality: params.nationality,
    ovrMin,
    ovrMax,
  });

  // 4. Head coach + fitness coach.
  const staff = await generateTeamStaff(
    manager,
    team.id,
    params.nationality,
  );

  // 5. Finance / fan / stadium (values differ for bot vs
  //    manager; encapsulated inside each helper).
  await generateTeamFinance(manager, team.id, params.isBot);
  await generateTeamFan(manager, team.id, params.isBot);
  await generateTeamStadium(manager, team.id);

  // 6. League standing — the bot path needs it for the
  //    season-1 schedule, the manager path needs it so the
  //    standings page doesn't 404 on day 1.
  await generateTeamStanding(
    manager,
    team.id,
    params.leagueId,
    params.season ?? DEFAULT_STANDING_SEASON,
  );

  return { team, players, staff };
}

// ============================================================
// Internal helpers (still exported individually so the
// OnboardingAssigner spec + any future surgical caller can
// reach them; `createTeam` is the recommended entry point).
// ============================================================

/**
 * Insert a new team row or update an existing one. The update
 * path is taken by onboarding: the BOT's `team.id` is
 * preserved (match_event / match / league_standing all FK to
 * it) while ownership flips to the new manager.
 *
 * `shortCode` is only written on insert (where the caller has
 * already generated a unique one) — on update it's left
 * alone, since renaming a club's URL shortCode would break
 * any saved `/team/XXXXX` links.
 */
async function upsertTeam(
  manager: EntityManager,
  params: CreateTeamParams,
): Promise<TeamEntity> {
  if (params.existingTeamId) {
    const existing = await manager.findOne(TeamEntity, {
      where: { id: params.existingTeamId },
    });
    if (!existing) {
      throw new Error(
        `createTeam: existingTeamId=${params.existingTeamId} not found`,
      );
    }
    existing.userId = params.userId;
    existing.isBot = params.isBot;
    existing.botLevel = params.isBot
      ? (params.botLevel ?? DEFAULT_BOT_LEVEL)
      : DEFAULT_BOT_LEVEL;
    existing.name = params.name;
    existing.nationality = params.nationality;
    return manager.save(existing);
  }

  const row = manager.create(TeamEntity, {
    name: params.name,
    leagueId: params.leagueId,
    userId: params.userId,
    isBot: params.isBot,
    botLevel: params.isBot
      ? (params.botLevel ?? DEFAULT_BOT_LEVEL)
      : DEFAULT_BOT_LEVEL,
    nationality: params.nationality,
    shortCode: params.shortCode,
    benchConfig: null,
    // `foundedYear` is registration-locked: stamp the current
    // year for every fresh team so a row never lands as null.
    // The PATCH surface refuses subsequent edits (see
    // `api/src/api/team/dto/update-team.req.dto.ts`). For the
    // update path above (the onboarding claim of an existing
    // BOT), we intentionally leave the existing `foundedYear`
    // alone — the BOT was "founded" at game init, the manager
    // is just the new owner.
    foundedYear: new Date().getFullYear(),
  });
  return manager.save(row);
}

/**
 * Wipe every "manager-controlled" row off a team. Called
 * from inside `createTeam` so a re-create (onboarding claim)
 * starts clean. Soft-delete for `player` and hard-delete for
 * the rest. The full rationale (FK to historical
 * `match_event`, OneToOne conflict on the seed insert) lives
 * in the original docstring further down — kept verbatim so
 * the migration backfill story stays traceable.
 */
export async function scrubManagerSpecificData(
  manager: EntityManager,
  teamId: string,
): Promise<void> {
  // 1. Soft-delete all live players — preserves FKs to
  //    historical match_event / player_event / player_competition_stats.
  await manager
    .createQueryBuilder()
    .update(PlayerEntity)
    .set({ deletedAt: () => 'NOW()' })
    .where('team_id = :teamId', { teamId })
    .andWhere('deleted_at IS NULL')
    .execute();

  // 2. Hard-delete the manager-controlled rows. All keyed
  //    by `team_id`. Why raw `manager.query`: TypeORM 0.3.x
  //    has a known bug where `manager.delete(Entity, …)`
  //    dispatches through a broken DeleteQueryBuilder
  //    (typeorm/typeorm#9367). All queries are parameterized.
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

// ============================================================
// Squad generation
// ============================================================

/**
 * Options bag for `generateTeamSquad`. Splits the
 * previously-long parameter list into a single object so
 * adding new fields (e.g. a future `archetype` knob) doesn't
 * break the call site signature.
 */
export interface GenerateSquadOptions {
  nationality: string | null;
  /** Per-player target OVR lower bound (inclusive). */
  ovrMin: number;
  /** Per-player target OVR upper bound (inclusive). */
  ovrMax: number;
  /**
   * Optional position distribution override. Defaults to
   * `TEAM_POSITION_DISTRIBUTION` (16 players, 2 GK + 14
   * outfield). When supplied, the squad size is derived from
   * the sum of values.
   */
  distribution?: Record<string, number>;
}

/**
 * Generate a starter squad for the given team. Always emits
 * `TEAM_SQUAD_SIZE` (16) players per the standard
 * distribution. Each player gets:
 *
 *   - a v2 `coreSpecialty` + `coreSpecialtyTier` from
 *     `rollSpecialty()` (5/15/30/50 distribution, position-
 *     agnostic);
 *   - skills sized so the realized OVR lands within ±2 of the
 *     per-player target OVR in [ovrMin, ovrMax];
 *   - a random name (pinned to the team's nationality 70% of
 *     the time, random otherwise — same mix as before);
 *   - a position-appropriate age roll biased toward 22-26
 *     prime-age.
 *
 * All inserts go through the supplied `EntityManager` so
 * squad creation rides inside `createTeam`'s caller's
 * transaction.
 */
export async function generateTeamSquad(
  manager: EntityManager,
  teamId: string,
  options: GenerateSquadOptions,
): Promise<PlayerEntity[]> {
  const teamNationality = options.nationality ?? DEFAULT_TEAM_NATIONALITY;
  const distribution =
    options.distribution ?? TEAM_POSITION_DISTRIBUTION;
  const positions = expandDistribution(distribution);

  const today = currentGameDay();
  const daysPerYear = GAME_SETTINGS.DAYS_PER_YEAR;
  const players: PlayerEntity[] = [];

  for (const position of positions) {
    const targetOvr = randomInt(options.ovrMin, options.ovrMax);
    const { currentSkills, potentialSkills } =
      generateSkillsForPosition(position, targetOvr);
    const potentialAbility =
      calculatePotentialAbility(potentialSkills);
    const isGoalkeeper = position === 'GK';

    // 70% squad nationality, 30% random — same mix as the
    // previous `generateTeamSquad`. Keeps the squad feeling
    // like a real club without being monochromatic.
    const playerNationality = Math.random() < 0.7
      ? teamNationality
      : pickRandomNationality();
    const { firstName, lastName } =
      getRandomNameByNationality(playerNationality);

    // Age biased toward 22-26 prime, with younger rookies
    // (18-20) and a small veteran tail (27-30). Mirrors the
    // original `generateTeamSquad` distribution so a
    // bot-built team and a manager-claimed team have the
    // same age shape.
    const ageRoll = Math.random();
    const age =
      ageRoll < 0.25
        ? DEFAULT_PLAYER_AGE_MIN + Math.floor(Math.random() * 3) // 18..20
        : ageRoll < 0.85
          ? 22 + Math.floor(Math.random() * 5)                    // 22..26
          : 27 + Math.floor(Math.random() * 4);                   // 27..30
    const daysAliveInYear = Math.floor(Math.random() * daysPerYear);
    const createdDay =
      today - age * daysPerYear - daysAliveInYear;

    // v2 specialty — single roll decides both presence and
    // tier. v2.4+ is position-aware: GK rolls from the 2-code
    // GK pool, outfield rolls from the 10-code outfield pool.
    // The two pools are disjoint so a GK can never get an
    // outfield buff (or vice versa).
    const specialtyRoll = rollSpecialty(undefined, isGoalkeeper);
    const coreSpecialty = specialtyRoll?.code ?? null;
    const coreSpecialtyTier = specialtyRoll?.tier;
    const abilities = coreSpecialty ? [coreSpecialty] : undefined;

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
      currentSkills: {
        ...currentSkills,
        abilities, // v1 legacy mirror on the JSONB
      } as unknown as PlayerEntity['currentSkills'],
      potentialSkills: potentialSkills as unknown as PlayerEntity['potentialSkills'],
      potentialAbility,
      // Experience ages with the player. Raw rookies start
      // low; prime-age pros have accumulated a few seasons.
      experience:
        0.5 + Math.random() * 2.5 + Math.max(0, age - 20) * 0.4,
      form: 3,
      stamina: 3,
      matchMinutes: 0,
      currentWage: 1500 + Math.floor(Math.random() * 2500) + age * 80,
      // v2 — primary path.
      coreSpecialty,
      coreSpecialtyTier,
      // v1 legacy mirror at the top level too. Lets the
      // migration script (and any leftover v1 reader) still
      // find a single code in `abilities`. Drop after the
      // v1 path is fully retired.
      abilities,
    });
    players.push(await manager.save(player));
  }

  return players;
}

/**
 * Flatten a `{ position: count }` distribution into a list of
 * position strings. E.g. `{ GK: 2, CD: 2, CM: 4 }` becomes
 * `['GK','GK','CD','CD','CM','CM','CM','CM']`. The order
 * here is the only determinism guarantee the squad builder
 * makes — call sites that need a stable order (tests,
 * deterministic seeds) should keep the distribution object
 * key order stable, which JS does for string keys.
 */
function expandDistribution(
  distribution: Record<string, number>,
): string[] {
  const out: string[] = [];
  for (const [position, count] of Object.entries(distribution)) {
    for (let i = 0; i < count; i++) {
      out.push(position);
    }
  }
  return out;
}

/**
 * Pick a random ISO 3166-1 alpha-2 code. Used by squad
 * generation when we want nationality variance (30% of the
 * time, per the squad builder's bias). The set is small
 * enough to inline; matches the dev-seed nationality pool.
 */
function pickRandomNationality(): string {
  const pool = ['CN', 'GB', 'ES', 'BR', 'IT', 'DE', 'FR', 'JP', 'KR', 'AR'];
  return pool[Math.floor(Math.random() * pool.length)];
}

/**
 * Generate a player's current + potential skills for the
 * given position and target OVR. Adapted from the previous
 * scheduler `TeamGeneratorService.generateSkills` so a
 * freshly-generated squad's skill shape matches what the
 * engine expects from a v1-era import.
 *
 * Algorithm:
 *   1. `skillBase = clamp(round(ovr / 5), 1, 20)` — turns a
 *      25-40 OVR target into a 5-8 skill base, then position
 *      templates add ±3 to primary / 0 to secondary / -3 to
 *      tertiary, plus a ±1 variance from the template.
 *   2. Potential = current + 1..4 per attribute (so a young
 *      player has real growth runway; a prime-age one has
 *      less but still some).
 */
function generateSkillsForPosition(
  position: string,
  targetOvr: number,
): {
  currentSkills: PlayerEntity['currentSkills'];
  potentialSkills: PlayerEntity['potentialSkills'];
} {
  const skillBase = Math.max(1, Math.min(20, Math.round(targetOvr / 5)));
  const v = () => Math.floor(Math.random() * 3) - 1; // -1, 0, +1
  const skill = (base: number, boost: number) =>
    Math.max(1, Math.min(20, base + boost + v()));

  const current = generatePositionSkills(position, skillBase, skill);
  const potential = bumpSkills(current, /* growth */ 2);

  return {
    currentSkills: wrapPlayerSkills(current),
    potentialSkills: wrapPlayerSkills(potential),
  };
}

/**
 * Build a position-shaped skill object. Mirrors the
 * scheduler's template — primary attributes get +3, secondary
 * get 0, tertiary get -3, with a ±1 variance. For GK the
 * `position` is a small fixed template; for outfield we lean
 * on a single "outfield" template.
 */
function generatePositionSkills(
  position: string,
  base: number,
  skill: (base: number, boost: number) => number,
): Record<string, Record<string, number>> {
  if (position === 'GK') {
    return {
      physical: {
        pace: skill(base, -3),
        strength: skill(base, -1),
      },
      technical: {
        reflexes: skill(base, 3),
        handling: skill(base, 3),
        aerial: skill(base, -2),
        positioning: skill(base, 0),
      },
      mental: {
        positioning: skill(base, 0),
        composure: skill(base, 1),
      },
      setPieces: {
        freeKicks: skill(base, -4),
        penalties: skill(base, -4),
      },
    };
  }

  // Outfield: tier by the position archetype so the squad
  // doesn't read as 16 generic players.
  const arch = positionArchetype(position);
  return {
    physical: {
      pace: skill(base, arch.boost('pace')),
      strength: skill(base, arch.boost('strength')),
    },
    technical: {
      finishing: skill(base, arch.boost('finishing')),
      passing: skill(base, arch.boost('passing')),
      dribbling: skill(base, arch.boost('dribbling')),
      defending: skill(base, arch.boost('defending')),
    },
    mental: {
      positioning: skill(base, arch.boost('positioning')),
      composure: skill(base, arch.boost('composure')),
    },
    setPieces: {
      freeKicks: skill(base, -3),
      penalties: skill(base, -3),
    },
  };
}

/**
 * Position archetype resolver. Each position declares its
 * primary / secondary / tertiary attributes; the skill
 * builder reads those to apply the +3 / 0 / -3 boost.
 *
 * Kept as a function (not a static map at module top) so a
 * future hot-patch (e.g. per-league archetype variance) can
 * read env / config without a refactor.
 */
function positionArchetype(position: string): {
  boost: (attr: string) => number;
} {
  const PRIMARY: Record<string, string[]> = {
    CD: ['defending', 'strength', 'positioning'],
    LB: ['pace', 'defending', 'positioning'],
    RB: ['pace', 'defending', 'positioning'],
    DM: ['defending', 'positioning', 'strength'],
    CM: ['passing', 'composure', 'positioning'],
    AM: ['passing', 'dribbling', 'composure'],
    LW: ['pace', 'dribbling', 'finishing'],
    RW: ['pace', 'dribbling', 'finishing'],
    CF: ['finishing', 'positioning', 'composure'],
  };
  const SECONDARY: Record<string, string[]> = {
    CD: ['pace', 'composure'],
    LB: ['passing', 'composure', 'strength'],
    RB: ['passing', 'composure', 'strength'],
    DM: ['passing', 'composure'],
    CM: ['dribbling', 'defending', 'pace'],
    AM: ['finishing', 'pace', 'positioning'],
    LW: ['passing', 'composure'],
    RW: ['passing', 'composure'],
    CF: ['pace', 'dribbling', 'strength'],
  };
  const primary = PRIMARY[position] ?? [];
  const secondary = SECONDARY[position] ?? [];
  return {
    boost: (attr: string) => {
      if (primary.includes(attr)) return 3;
      if (secondary.includes(attr)) return 0;
      return -3;
    },
  };
}

/**
 * Per-attribute bump from current → potential. Adds 1..4 per
 * attribute (uniform) so a young player has real growth
 * runway. Bounded by the [1, 20] skill clamp applied at read
 * time — no need to re-clamp here.
 */
function bumpSkills(
  current: Record<string, Record<string, number>>,
  growth: number,
): Record<string, Record<string, number>> {
  const out: Record<string, Record<string, number>> = {};
  for (const [bucket, attrs] of Object.entries(current)) {
    const bumped: Record<string, number> = {};
    for (const [k, v] of Object.entries(attrs)) {
      bumped[k] = v + Math.floor(Math.random() * growth) + 1;
    }
    out[bucket] = bumped;
  }
  return out;
}

/**
 * Wrap a `{ physical, technical, mental, setPieces }` object
 * in the `PlayerSkills` shape the entity expects. The cast
 * is the same escape hatch the original `generateRandomSkills`
 * used — `PlayerSkills` is a closed union and TS can't
 * narrow it from a dynamically-keyed map.
 */
function wrapPlayerSkills(
  raw: Record<string, Record<string, number>>,
): PlayerEntity['currentSkills'] {
  return raw as unknown as PlayerEntity['currentSkills'];
}

// ============================================================
// Staff / Finance / Fan / Stadium / Standing
// ============================================================

/**
 * Generate the two default coaching staff rows that every
 * team needs to function (a head coach for the matchday-11
 * and a fitness coach for stamina recovery). Salary and
 * contract length mirror the api-side `TeamService.create`
 * defaults. 16-week contract is long enough that an owner
 * who doesn't touch the staff page for a while doesn't get
 * an instant staff crisis.
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
 * Create a fresh `finance` row. The starting balance differs
 * for BOT vs manager (see the `BOT_STARTING_BALANCE` /
 * `MANAGER_STARTING_BALANCE` constants). The pre-scrub
 * inherited row is wiped inside `createTeam` so the
 * OneToOne-style unique-per-team relationship doesn't
 * conflict on insert.
 */
export async function generateTeamFinance(
  manager: EntityManager,
  teamId: string,
  isBot: boolean,
): Promise<FinanceEntity> {
  const row = manager.create(FinanceEntity, {
    teamId,
    balance: isBot ? BOT_STARTING_BALANCE : MANAGER_STARTING_BALANCE,
  });
  return manager.save(row);
}

/**
 * Create a fresh `fan` row. Starting fans and emotion differ
 * slightly for BOT vs manager — bots get a smaller-but-not-
 * zero baseline; managers get 10k + neutral 50/100 emotion.
 */
export async function generateTeamFan(
  manager: EntityManager,
  teamId: string,
  isBot: boolean,
): Promise<FanEntity> {
  const row = manager.create(FanEntity, {
    teamId,
    totalFans: isBot ? BOT_STARTING_FANS : MANAGER_STARTING_FANS,
    fanEmotion: 50,
    recentForm: '',
  });
  return manager.save(row);
}

/**
 * Create a fresh `stadium` row. Capacity is fixed at 10k for
 * both bot and manager. `isBuilt = true` so the team can
 * host home matches on day 1 — a half-built stadium would
 * block the first home fixture and force a construction
 * timer nobody signed up for.
 */
export async function generateTeamStadium(
  manager: EntityManager,
  teamId: string,
): Promise<StadiumEntity> {
  const row = manager.create(StadiumEntity, {
    teamId,
    capacity: DEFAULT_STADIUM_CAPACITY,
    isBuilt: true,
  });
  return manager.save(row);
}

/**
 * Create a fresh `league_standing` row (season 1, position 0,
 * zeroes across the board). Required so the standings page
 * doesn't 404 on day 1 and so the season-end scheduler has a
 * row to update. Idempotent: skipped if a row already exists
 * for (league, team, season).
 */
export async function generateTeamStanding(
  manager: EntityManager,
  teamId: string,
  leagueId: string,
  season: number = DEFAULT_STANDING_SEASON,
): Promise<LeagueStandingEntity | null> {
  const existing = await manager.findOne(LeagueStandingEntity, {
    where: { teamId, leagueId, season },
  });
  if (existing) return null;

  const row = manager.create(LeagueStandingEntity, {
    teamId,
    leagueId,
    season,
    position: 0,
    played: 0,
    points: 0,
    wins: 0,
    draws: 0,
    losses: 0,
    goalsFor: 0,
    goalsAgainst: 0,
    goalDifference: 0,
    recentForm: '',
  });
  return manager.save(row);
}

// ============================================================
// Internal helpers (math / names)
// ============================================================

/**
 * Inclusive random integer in [min, max]. Replaces the
 * `Math.floor(Math.random() * (max - min + 1)) + min`
 * snippet that was scattered through the bot + scheduler
 * generators.
 */
function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Mirror of `PlayerService.calculatePotentialAbility` from
 * the api/. Kept private here so `createTeam` can stamp a
 * sane PA on each new row without pulling in a service.
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
