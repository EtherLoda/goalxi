import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Add `lineup_v2` / `substitutions_v2` columns to `match_tactics` storing
 * player references as `int` (the new player.id type) instead of the old
 * `uuid` shape.
 *
 * Background: the `PlayerIdToNumeric` migration dropped the `_old_id` uuid
 * column on `player` after converting all child FK columns. That left no
 * recoverable uuid→int mapping for JSONB data that referenced players by
 * uuid (match_tactics.lineup, match_tactics.substitutions, and the
 * `players[].id` snapshots inside `match_event.data`).
 *
 * Strategy:
 *   1. Add nullable `lineup_v2` (jsonb) and `substitutions_v2` (jsonb) to
 *      `match_tactics`. Both default to NULL — code that reads them should
 *      treat NULL/empty as "tactics need to be re-submitted by the user".
 *   2. Wipe the legacy `lineup` column to an empty object and the legacy
 *      `substitutions` column to NULL. The columns themselves stay so the
 *      type doesn't drift, but they no longer contain valid player
 *      references.
 *   3. (No-op for `match_event.data` — historical snapshots remain as-is;
 *      the simulator and the web gracefully skip players whose snapshot id
 *      cannot be resolved to a current player row.)
 *
 * Idempotent: safe to re-run.
 */
export class MatchTacticsLineupToInt1724100000000 implements MigrationInterface {
  name = 'MatchTacticsLineupToInt1724100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add v2 columns. nullable so we don't need a backfill.
    await queryRunner.query(`
            ALTER TABLE "match_tactics"
            ADD COLUMN IF NOT EXISTS "lineup_v2" jsonb
        `);
    await queryRunner.query(`
            ALTER TABLE "match_tactics"
            ADD COLUMN IF NOT EXISTS "substitutions_v2" jsonb
        `);

    // Wipe legacy uuid-keyed data. We can't translate it; users will
    // re-submit their tactics and populate lineup_v2.
    await queryRunner.query(`
            UPDATE "match_tactics"
            SET "lineup" = '{}'::jsonb
            WHERE "lineup" IS NOT NULL
              AND "lineup" <> '{}'::jsonb
        `);
    await queryRunner.query(`
            UPDATE "match_tactics"
            SET "substitutions" = NULL
            WHERE "substitutions" IS NOT NULL
        `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Cannot restore the original uuid-keyed data; this is one-way.
    await queryRunner.query(
      `ALTER TABLE "match_tactics" DROP COLUMN IF EXISTS "lineup_v2"`,
    );
    await queryRunner.query(
      `ALTER TABLE "match_tactics" DROP COLUMN IF EXISTS "substitutions_v2"`,
    );
  }
}
