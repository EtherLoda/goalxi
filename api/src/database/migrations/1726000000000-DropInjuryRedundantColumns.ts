import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Drop two redundant columns on the `injury` table:
 *
 * - `is_recovered`  (boolean)  — equivalent to `recovered_at IS NOT NULL`,
 *                                prone to drift. Replaced by deriving
 *                                `isRecovered` from `recoveredAt` in code.
 * - `estimated_min_days` (int) — the only writer was always passing the
 *                                same value as `estimated_max_days`, so
 *                                the column carried no information.
 *
 * Both columns are dropped with `IF EXISTS` so the migration is idempotent
 * on databases that have already run a partial cleanup. The supporting
 * `IDX_injury_is_recovered` index is removed in the same pass — it would
 * otherwise sit on a missing column and start failing any future
 * `ANALYZE` / `REINDEX`.
 */
export class DropInjuryRedundantColumns1726000000000
  implements MigrationInterface
{
  name = 'DropInjuryRedundantColumns1726000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "injury" DROP COLUMN IF EXISTS "is_recovered"
    `);
    await queryRunner.query(`
      ALTER TABLE "injury" DROP COLUMN IF EXISTS "estimated_min_days"
    `);
    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_injury_is_recovered"
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Re-add the columns with their original definitions (NOT NULL +
    // default) so re-running this migration's inverse matches the
    // pre-up schema. Backfill `is_recovered` from `recovered_at` so the
    // data stays consistent.
    await queryRunner.query(`
      ALTER TABLE "injury" ADD COLUMN "is_recovered" boolean NOT NULL DEFAULT false
    `);
    await queryRunner.query(`
      UPDATE "injury" SET "is_recovered" = (recovered_at IS NOT NULL)
    `);
    await queryRunner.query(`
      ALTER TABLE "injury" ALTER COLUMN "is_recovered" DROP DEFAULT
    `);

    await queryRunner.query(`
      ALTER TABLE "injury" ADD COLUMN "estimated_min_days" integer
    `);
    // Best-effort backfill: copy the max value into min so the column
    // matches the historical invariant (min === max).
    await queryRunner.query(`
      UPDATE "injury" SET "estimated_min_days" = "estimated_max_days"
        WHERE "estimated_min_days" IS NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "injury" ALTER COLUMN "estimated_min_days" SET NOT NULL
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_injury_is_recovered" ON "injury" ("is_recovered")
    `);
  }
}
