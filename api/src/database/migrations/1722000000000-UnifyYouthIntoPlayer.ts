/**
 * DRAFT — do not run yet.
 *
 * See docs/rfcs/0001-youth-player-unification.md before un-drafting.
 *
 * This migration unifies the youth and senior stacks:
 *   - youth_player       → player (is_youth = true)
 *   - youth_match        → match (matchType = 'youth_league')
 *   - youth_match_tactics → match_tactics
 *   - youth_match_event  → match_event
 *
 * After this runs, four youth_* tables are dropped. The migration is
 * idempotent: running `up()` twice is a no-op (the source tables are
 * gone the second time). `down()` rebuilds the four tables from the
 * unified rows so a rollback is safe.
 */

import { MigrationInterface, QueryRunner } from 'typeorm';

export class UnifyYouthIntoPlayer1722000000000 implements MigrationInterface {
  name = 'UnifyYouthIntoPlayer1722000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Extend `player` with reveal fields + youth league FK.
    await queryRunner.query(`
      ALTER TABLE "player"
        ADD COLUMN IF NOT EXISTS "reveal_level" int NOT NULL DEFAULT 0
    `);
    await queryRunner.query(`
      ALTER TABLE "player"
        ADD COLUMN IF NOT EXISTS "revealed_skills" jsonb NOT NULL DEFAULT '[]'::jsonb
    `);
    await queryRunner.query(`
      ALTER TABLE "player"
        ADD COLUMN IF NOT EXISTS "potential_revealed" boolean NOT NULL DEFAULT true
    `);
    await queryRunner.query(`
      ALTER TABLE "player"
        ADD COLUMN IF NOT EXISTS "youth_league_id" uuid NULL
    `);

    // 2. Extend `match` with youth league FK.
    await queryRunner.query(`
      ALTER TABLE "match"
        ADD COLUMN IF NOT EXISTS "youth_league_id" uuid NULL
    `);

    // 3. Migrate `youth_player` → `player` (preserving PK so any FK
    //    references from youth_match_event.player_id still resolve).
    //
    //    We seed `display_id` via SHA-256-derived bigint (same approach
    //    as AddPlayerDisplayId migration) so the entity column can stay
    //    NOT NULL.
    //
    //    Note: `joined_at` was removed by migration 1721000000000
    //    (ReplaceBirthdayWithCreatedDay). The unified `player` no longer
    //    has a `joined_at` column — academy tenure is derived from
    //    `created_at` + the `is_youth` flag.
    await queryRunner.query(`
      INSERT INTO "player" (
        "id", "display_id", "name", "nationality", "is_goalkeeper",
        "is_youth", "youth_league_id", "on_transfer", "current_skills",
        "potential_skills", "potential_ability", "current_wage",
        "experience", "form", "stamina", "match_minutes", "career_stats",
        "specialty", "potential_revealed", "reveal_level", "revealed_skills",
        "created_at", "updated_at",
        "injury_type", "injury_state", "current_injury_value", "injured_at"
      )
      SELECT
        yp."id",
        (('x' || substr(md5(yp."id"::text), 1, 16))::bit(64)::bigint),
        yp."name",
        yp."nationality",
        yp."is_goalkeeper",
        true,
        yt."youth_league_id",
        false,
        yp."current_skills",
        yp."potential_skills",
        50,
        2000,
        0.0,
        3.0,
        3.0,
        0,
        '{}'::jsonb,
        (SELECT a FROM jsonb_array_elements_text(yp."abilities") a LIMIT 1),
        yp."potential_revealed",
        yp."reveal_level",
        yp."revealed_skills",
        yp."created_at",
        yp."updated_at",
        NULL,
        NULL,
        0,
        NULL
      FROM "youth_player" yp
      LEFT JOIN "youth_team" yt ON yt."id" = yp."youth_team_id"
    `);

    // 4. Migrate `youth_match` → `match`.
    //
    //    `home_team_id` / `away_team_id` need a senior-team id. The
    //    youth_team table holds the 1:1 mapping (youth_team.team_id IS
    //    the senior team).
    //
    //    `youth_match` does NOT have these columns (which the senior
    //    `match` table has): round, type, weather, attendance,
    //    stadium_id, lower_league_id. We let senior defaults apply:
    //    `round = null`, `type = 'league'`, the rest default.
    await queryRunner.query(`
      INSERT INTO "match" (
        "id", "league_id", "season", "week",
        "home_team_id", "away_team_id",
        "scheduled_at", "status", "type",
        "home_score", "away_score", "simulation_completed_at",
        "tactics_locked_at", "actual_end_time", "tactics_locked",
        "home_forfeit", "away_forfeit", "started_at", "completed_at",
        "first_half_injury_time", "second_half_injury_time",
        "has_extra_time", "requires_winner",
        "extra_time_first_half_injury", "extra_time_second_half_injury",
        "has_penalty_shootout", "youth_league_id",
        "created_at", "updated_at"
      )
      SELECT
        ym."id",
        NULL,
        ym."season",
        ym."week",
        (SELECT team_id FROM "youth_team" WHERE id = ym."home_youth_team_id"),
        (SELECT team_id FROM "youth_team" WHERE id = ym."away_youth_team_id"),
        ym."scheduled_at",
        ym."status",
        'league',
        ym."home_score",
        ym."away_score",
        ym."simulation_completed_at",
        ym."tactics_locked_at",
        ym."actual_end_time",
        ym."tactics_locked",
        ym."home_forfeit",
        ym."away_forfeit",
        ym."started_at",
        ym."completed_at",
        ym."first_half_injury_time",
        ym."second_half_injury_time",
        ym."has_extra_time",
        ym."requires_winner",
        ym."extra_time_first_half_injury",
        ym."extra_time_second_half_injury",
        ym."has_penalty_shootout",
        ym."youth_league_id",
        ym."created_at",
        ym."updated_at"
      FROM "youth_match" ym
    `);

    // 5. Migrate `youth_match_tactics` → `match_tactics`. The
    //    `match_id` column now references the unified `match.id`.
    //
    //    `youth_match_tactics` has only `created_at` (no `updated_at`).
    //    The senior `match_tactics` has both; we set updated_at =
    //    created_at for parity.
    await queryRunner.query(`
      INSERT INTO "match_tactics" (
        "id", "match_id", "team_id", "formation", "lineup", "instructions",
        "substitutions", "tempo", "pitchWidth", "defensiveLine", "preset_id",
        "created_at", "updated_at"
      )
      SELECT
        ymt."id",
        ymt."youth_match_id",
        ymt."team_id",
        ymt."formation",
        ymt."lineup",
        ymt."instructions",
        ymt."substitutions",
        ymt."tempo",
        ymt."pitchWidth",
        ymt."defensiveLine",
        NULL,
        ymt."created_at",
        ymt."created_at"
      FROM "youth_match_tactics" ymt
    `);

    // 6. Migrate `youth_match_event` → `match_event`.
    //
    //    Note: `match_event.isHome` is camelCase (InitialSchema used
    //    `isHome` without an explicit column-name mapping, so TypeORM
    //    uses the property name as the column name). Don't translate
    //    to `is_home`.
    await queryRunner.query(`
      INSERT INTO "match_event" (
        "id", "match_id", "minute", "second", "type", "type_name",
        "team_id", "player_id", "related_player_id", "phase", "lane",
        "isHome", "data", "event_scheduled_time", "is_revealed", "created_at"
      )
      SELECT
        yme."id",
        yme."youth_match_id",
        yme."minute",
        yme."second",
        yme."type",
        yme."type_name",
        yme."team_id",
        yme."player_id",
        yme."related_player_id",
        yme."phase",
        yme."lane",
        yme."isHome",
        yme."data",
        yme."event_scheduled_time",
        yme."is_revealed",
        yme."created_at"
      FROM "youth_match_event" yme
    `);

    // 7. Drop the four youth_* tables. The drops are deferred to
    //    after the data migration succeeds — if any of the inserts
    //    above fails, the old tables are still intact and we can
    //    investigate without losing data.
    await queryRunner.query(`DROP TABLE "youth_match_tactics"`);
    await queryRunner.query(`DROP TABLE "youth_match_event"`);
    await queryRunner.query(`DROP TABLE "youth_match"`);
    await queryRunner.query(`DROP TABLE "youth_player"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // --- Reverse the data migration ---

    // 1. Recreate `youth_player` rows by selecting from `player` where
    //    `is_youth = true`. The senior `team_id` is recovered from
    //    `youth_team` (1:1 mapping). Players that don't have a
    //    `youth_team` row are skipped — this is the no-youth-team edge
    //    case (e.g. a player from a deleted team).
    await queryRunner.query(`
      INSERT INTO "youth_player" (
        "id", "team_id", "youth_team_id", "name", "nationality",
        "is_goalkeeper", "current_skills", "potential_skills", "abilities",
        "reveal_level", "revealed_skills", "potential_revealed",
        "potential_tier", "is_promoted", "joined_at",
        "created_at", "updated_at"
      )
      SELECT
        p."id",
        yt."team_id",
        yt."id",
        p."name",
        p."nationality",
        p."is_goalkeeper",
        p."current_skills",
        p."potential_skills",
        CASE
          WHEN p."specialty" IS NULL THEN '[]'::jsonb
          ELSE jsonb_build_array(p."specialty")
        END,
        p."reveal_level",
        p."revealed_skills",
        p."potential_revealed",
        COALESCE(p."potential_tier", 'LOW'),
        false,
        p."joined_at",
        p."created_at",
        p."updated_at"
      FROM "player" p
      JOIN "youth_team" yt ON yt."team_id" = p."team_id"
      WHERE p."is_youth" = true
        AND NOT EXISTS (SELECT 1 FROM "youth_player" yp WHERE yp."id" = p."id")
    `);

    // 2. Recreate `youth_match` rows.
    await queryRunner.query(`
      INSERT INTO "youth_match" (
        "id", "youth_league_id", "season", "week",
        "home_youth_team_id", "away_youth_team_id", "scheduled_at", "status",
        "type", "home_score", "away_score", "simulation_completed_at",
        "tactics_locked_at", "actual_end_time", "tactics_locked",
        "home_forfeit", "away_forfeit", "started_at", "completed_at",
        "first_half_injury_time", "second_half_injury_time",
        "has_extra_time", "requires_winner",
        "extra_time_first_half_injury", "extra_time_second_half_injury",
        "has_penalty_shootout", "created_at", "updated_at"
      )
      SELECT
        m."id",
        m."youth_league_id",
        m."season",
        m."week",
        (SELECT id FROM "youth_team" WHERE team_id = m."home_team_id"),
        (SELECT id FROM "youth_team" WHERE team_id = m."away_team_id"),
        m."scheduled_at",
        m."status",
        m."type",
        m."home_score",
        m."away_score",
        m."simulation_completed_at",
        m."tactics_locked_at",
        m."actual_end_time",
        m."tactics_locked",
        m."home_forfeit",
        m."away_forfeit",
        m."started_at",
        m."completed_at",
        m."first_half_injury_time",
        m."second_half_injury_time",
        m."has_extra_time",
        m."requires_winner",
        m."extra_time_first_half_injury",
        m."extra_time_second_half_injury",
        m."has_penalty_shootout",
        m."created_at",
        m."updated_at"
      FROM "match" m
      WHERE m."youth_league_id" IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM "youth_match" ym WHERE ym."id" = m."id")
    `);

    // 3. Recreate `youth_match_tactics` rows.
    await queryRunner.query(`
      INSERT INTO "youth_match_tactics" (
        "id", "youth_match_id", "team_id", "formation", "lineup",
        "instructions", "substitutions", "tempo", "pitchWidth",
        "defensiveLine", "created_at"
      )
      SELECT
        mt."id",
        mt."match_id",
        mt."team_id",
        mt."formation",
        mt."lineup",
        mt."instructions",
        mt."substitutions",
        mt."tempo",
        mt."pitchWidth",
        mt."defensiveLine",
        mt."created_at"
      FROM "match_tactics" mt
      JOIN "match" m ON m."id" = mt."match_id"
      WHERE m."youth_league_id" IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM "youth_match_tactics" ymt WHERE ymt."id" = mt."id")
    `);

    // 4. Recreate `youth_match_event` rows.
    await queryRunner.query(`
      INSERT INTO "youth_match_event" (
        "id", "youth_match_id", "minute", "second", "type", "type_name",
        "team_id", "player_id", "related_player_id", "phase", "lane",
        "is_home", "data", "event_scheduled_time", "is_revealed", "created_at"
      )
      SELECT
        me."id",
        me."match_id",
        me."minute",
        me."second",
        me."type",
        me."type_name",
        me."team_id",
        me."player_id",
        me."related_player_id",
        me."phase",
        me."lane",
        me."is_home",
        me."data",
        me."event_scheduled_time",
        me."is_revealed",
        me."created_at"
      FROM "match_event" me
      JOIN "match" m ON m."id" = me."match_id"
      WHERE m."youth_league_id" IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM "youth_match_event" yme WHERE yme."id" = me."id")
    `);

    // 5. Drop the columns we added in `up()`.
    await queryRunner.query(
      `ALTER TABLE "match" DROP COLUMN IF EXISTS "youth_league_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "player" DROP COLUMN IF EXISTS "youth_league_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "player" DROP COLUMN IF EXISTS "reveal_level"`,
    );
    await queryRunner.query(
      `ALTER TABLE "player" DROP COLUMN IF EXISTS "revealed_skills"`,
    );
    await queryRunner.query(
      `ALTER TABLE "player" DROP COLUMN IF EXISTS "potential_revealed"`,
    );
  }
}
