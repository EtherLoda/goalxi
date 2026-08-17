import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds `core_specialty` + `core_specialty_tier` to `player` for the v2 specialty system.
 *
 * - `core_specialty` varchar(32) NULL: the specialty code (e.g. 'AERIAL_THREAT').
 *   NULL means the player has no specialty (50% of generated players per the
 *   5/15/30/50 distribution in `specialty-generator.ts`).
 *
 * - `core_specialty_tier` varchar(8) NOT NULL DEFAULT 'BRONZE': the tier
 *   (GOLD / SILVER / BRONZE). Tier is independent of player attributes
 *   (random 5/15/30 distribution) and is only meaningful when
 *   `core_specialty` is NOT NULL — but we keep it NOT NULL so reads
 *   don't have to coalesce, and we backfill 'BRONZE' as a safe default
 *   for the (very rare) case where someone writes a tier without a
 *   specialty.
 *
 * - We do NOT backfill from the old `attributes->abilities` JSONB here.
 *   The separate migration script `scripts/migrate-specialty-v2.ts`
 *   does that — keeping the data-migration logic in a script (which
 *   has a dry-run flag and can be re-run) rather than baked into the
 *   schema migration (which is one-shot and irreversible on prod).
 *
 * - down() drops both columns. The `abilities` JSONB field on
 *   `currentSkills` is left untouched — the script migration handles
 *   the "no longer has abilities" cleanup if the user wants it.
 */
export class AddCoreSpecialtyFields1730000000000 implements MigrationInterface {
  name = 'AddCoreSpecialtyFields1730000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "player"
      ADD COLUMN IF NOT EXISTS "core_specialty" varchar(32) NULL
    `);

    await queryRunner.query(`
      ALTER TABLE "player"
      ADD COLUMN IF NOT EXISTS "core_specialty_tier" varchar(8) NOT NULL DEFAULT 'BRONZE'
    `);

    // Partial index on the specialty code for squad/transfers filters that
    // do "find all players with specialty X" — without this we'd full-scan
    // the player table on every transfer-market filter dropdown.
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_player_core_specialty"
      ON "player" ("core_specialty")
      WHERE "core_specialty" IS NOT NULL AND "deleted_at" IS NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_player_core_specialty"`);
    await queryRunner.query(
      `ALTER TABLE "player" DROP COLUMN IF EXISTS "core_specialty_tier"`,
    );
    await queryRunner.query(
      `ALTER TABLE "player" DROP COLUMN IF EXISTS "core_specialty"`,
    );
  }
}
