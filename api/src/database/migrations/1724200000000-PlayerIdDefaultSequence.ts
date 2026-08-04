import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Binds `player.id` to the `player_id_seq` sequence.
 *
 * Background: the earlier 1724000000000-PlayerIdToNumeric migration
 * created `player_id_seq` and backfilled every existing player row with
 * an integer id, but the final `RENAME COLUMN "id_new" TO "id"` step did
 * not attach the sequence as the column's DEFAULT expression. The id
 * column ended up as `integer NOT NULL` with no default, so any new
 * INSERT (e.g. `seed:run`, simulator, or admin tooling) that let
 * TypeORM skip the column failed with
 *   "null value in column 'id' of relation 'player' violates not-null constraint".
 *
 * This migration sets the column DEFAULT to `nextval('player_id_seq'::regclass)`
 * so new rows get an auto-incremented id and TypeORM's
 * "skip increment columns on insert" behaviour works as designed.
 *
 * Idempotent: bails out when the DEFAULT is already bound (re-runs after
 * a fresh apply are no-ops).
 */
export class PlayerIdDefaultSequence1724200000000 implements MigrationInterface {
  name = 'PlayerIdDefaultSequence1724200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const result = await queryRunner.query(`
      SELECT pg_get_expr(d.adbin, d.adrelid) AS default_expr
      FROM pg_attrdef d
      JOIN pg_attribute a
        ON a.attrelid = d.adrelid AND a.attnum = d.adnum
      WHERE a.attrelid = '"player"'::regclass
        AND a.attname = 'id'
        AND NOT a.attisdropped
    `);

    const current = result[0]?.default_expr as string | undefined;
    if (current && current.includes("nextval('player_id_seq'")) {
      return; // already bound — nothing to do
    }

    // Ensure the sequence exists even if 1724000000000-PlayerIdToNumeric
    // never ran on this environment (e.g. legacy DB that already had an
    // integer id column from an earlier branch of work).
    await queryRunner.query(`
      CREATE SEQUENCE IF NOT EXISTS player_id_seq START 100000001
    `);

    await queryRunner.query(`
      ALTER TABLE "player"
      ALTER COLUMN "id" SET DEFAULT nextval('player_id_seq'::regclass)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "player"
      ALTER COLUMN "id" DROP DEFAULT
    `);
    // Leave the sequence in place — dropping it would risk breaking any
    // other object that depends on it. Operators can drop it manually
    // with `DROP SEQUENCE IF EXISTS player_id_seq` if they really need to.
  }
}
