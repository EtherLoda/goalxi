import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Add `lineup_v2` / `substitutions_v2` columns to `tactics_preset` storing
 * player references as `int` (the new player.id type) instead of the old
 * `uuid` shape.
 *
 * This is the `tactics_preset` counterpart of
 * `MatchTacticsLineupToInt1724100000000` (which fixed the same problem on
 * `match_tactics`). The original `PlayerIdToNumeric` migration dropped the
 * `_old_id` uuid column on `player` after converting all child FK columns,
 * leaving no recoverable uuid→int mapping for JSONB data that referenced
 * players by uuid — including the `lineup` / `substitutions` columns on
 * `tactics_preset`.
 *
 * Without this migration, any read on the `tactics_preset` table fails with
 * `42703 undefined_column` because `TacticsPresetEntity` declares both the
 * legacy and v2 columns, and TypeORM selects them all.
 *
 * Strategy:
 *   1. Add nullable `lineup_v2` (jsonb) and `substitutions_v2` (jsonb) to
 *      `tactics_preset`. Both default to NULL — code that reads them should
 *      treat NULL/empty as "preset needs to be re-saved by the user".
 *   2. Wipe the legacy `lineup` column to an empty object and the legacy
 *      `substitutions` column to NULL. The columns themselves stay so the
 *      type doesn't drift, but they no longer contain valid player
 *      references. (The `match_tactics` migration follows the same rule;
 *      keeping behaviour consistent across both tables.)
 *
 * Idempotent: safe to re-run.
 */
export class TacticsPresetLineupToInt1724200000000 implements MigrationInterface {
  name = 'TacticsPresetLineupToInt1724200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add v2 columns. nullable so we don't need a backfill.
    await queryRunner.query(`
            ALTER TABLE "tactics_preset"
            ADD COLUMN IF NOT EXISTS "lineup_v2" jsonb
        `);
    await queryRunner.query(`
            ALTER TABLE "tactics_preset"
            ADD COLUMN IF NOT EXISTS "substitutions_v2" jsonb
        `);

    // Wipe legacy uuid-keyed data. We can't translate it; users will
    // re-save their presets to populate lineup_v2.
    await queryRunner.query(`
            UPDATE "tactics_preset"
            SET "lineup" = '{}'::jsonb
            WHERE "lineup" IS NOT NULL
              AND "lineup" <> '{}'::jsonb
        `);
    await queryRunner.query(`
            UPDATE "tactics_preset"
            SET "substitutions" = NULL
            WHERE "substitutions" IS NOT NULL
        `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Cannot restore the original uuid-keyed data; this is one-way.
    await queryRunner.query(
      `ALTER TABLE "tactics_preset" DROP COLUMN IF EXISTS "lineup_v2"`,
    );
    await queryRunner.query(
      `ALTER TABLE "tactics_preset" DROP COLUMN IF EXISTS "substitutions_v2"`,
    );
  }
}
