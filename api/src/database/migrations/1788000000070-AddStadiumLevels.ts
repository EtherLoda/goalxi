import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Stadium levels: `stadium.level` plus the `UPGRADE` construction kind.
 *
 * ## What a level is
 *
 * A gate, not a multiplier. `stadiumCapacityCap(level)` is the ceiling on
 * `stadium.capacity`; the level itself contributes no money. Ticket income
 * stays `capacity × attendance × price`, so a level only pays off once the
 * club fills what it unlocks — see `stadium-levels.constants.ts` for why a
 * per-seat price bonus was rejected (it would compound into an advantage
 * that new clubs can never catch up with).
 *
 * ## Why the backfill is mandatory
 *
 * Every existing ground predates the ladder. Without a backfill they would
 * all default to level 1 (= 20,000 seats) while some already hold more,
 * which would make the next `EXPAND` or `DEMOLISH` pass a cap check that
 * their own capacity already violates. `stadiumLevelForCapacity` maps each
 * row to the smallest level that accommodates it, so **no stadium is
 * shrunk** by the introduction of levels.
 *
 * ## Why the enum value is added here and not in a second migration
 *
 * `kind` is a real Postgres enum (`stadium_construction_kind_enum`).
 * `ALTER TYPE ... ADD VALUE` is allowed inside a transaction on PG 12+, and
 * this migration never *uses* the new value in the same transaction — it
 * only registers it. Adding it up front keeps the whole change atomic; a
 * half-applied state would leave the entity claiming a kind the database
 * rejects.
 *
 * `down()` intentionally does not remove the enum value: PG has no
 * `DROP VALUE`, and a leftover unused label is harmless (nothing selects
 * it once the column and the code path are gone).
 *
 * ## Idempotency
 *
 * Every statement is guarded (`IF NOT EXISTS`, `DROP CONSTRAINT IF EXISTS`),
 * so a re-run or a partially applied migration is harmless.
 */
export class AddStadiumLevels1788000000070 implements MigrationInterface {
  name = 'AddStadiumLevels1788000000070';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "stadium"
      ADD COLUMN IF NOT EXISTS "level" integer NOT NULL DEFAULT 1
    `);

    await queryRunner.query(`
      ALTER TABLE "stadium"
      DROP CONSTRAINT IF EXISTS "CHK_stadium_level"
    `);
    await queryRunner.query(`
      ALTER TABLE "stadium"
      ADD CONSTRAINT "CHK_stadium_level" CHECK ("level" >= 1 AND "level" <= 5)
    `);

    await queryRunner.query(`
      ALTER TYPE "stadium_construction_kind_enum"
      ADD VALUE IF NOT EXISTS 'UPGRADE'
    `);

    await queryRunner.query(`
      ALTER TABLE "stadium_construction"
      ADD COLUMN IF NOT EXISTS "target_level" integer
    `);

    // Backfill: smallest level whose cap accommodates the current capacity,
    // clamped to [1, 5]. Mirrors `stadiumLevelForCapacity()`.
    await queryRunner.query(`
      UPDATE "stadium"
      SET "level" = LEAST(
        5,
        GREATEST(1, CEIL("capacity"::numeric / 20000))
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "stadium_construction"
      DROP COLUMN IF EXISTS "target_level"
    `);
    await queryRunner.query(`
      ALTER TABLE "stadium"
      DROP CONSTRAINT IF EXISTS "CHK_stadium_level"
    `);
    await queryRunner.query(`
      ALTER TABLE "stadium"
      DROP COLUMN IF EXISTS "level"
    `);
    // The `UPGRADE` enum label is left in place — Postgres cannot drop a
    // single enum value, and an unused label breaks nothing.
  }
}
