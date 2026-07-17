import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Recreates the `injury` table that the original `1767000000000-AddInjurySystem`
 * migration created, but was accidentally dropped during the migrations
 * consolidation refactor (commit 0efaed0). Without this table, the simulator's
 * bulk-insert at the end of runSimulation throws
 *   "relation 'injury' does not exist"
 * and the match aborts with a job failure.
 *
 * The same DDL is also embedded into InitialSchema so future fresh setups
 * include the table from the start.
 */
export class AddInjuryTable1723300000000 implements MigrationInterface {
  name = 'AddInjuryTable1723300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Idempotent: production DBs already have the `injury` table (created
    // by the original 1767000000000 migration, or by a manual fix after
    // commit 0efaed0 dropped it). Bail out instead of failing the whole
    // migration run — every later migration depends on this one running
    // to completion first.
    const exists = await queryRunner.hasTable('injury');
    if (exists) {
      return;
    }

    await queryRunner.query(`
      CREATE TABLE "injury" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "player_id" uuid NOT NULL,
        "match_id" uuid,
        "injury_type" character varying(20) NOT NULL,
        "severity" integer NOT NULL,
        "injury_value" integer NOT NULL,
        "estimated_min_days" integer NOT NULL,
        "estimated_max_days" integer NOT NULL,
        "occurred_at" TIMESTAMP WITH TIME ZONE NOT NULL,
        "recovered_at" TIMESTAMP WITH TIME ZONE,
        "is_recovered" boolean NOT NULL DEFAULT false,
        CONSTRAINT "PK_injury_id" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      ALTER TABLE "injury"
      ADD CONSTRAINT "FK_injury_player_id" FOREIGN KEY ("player_id")
      REFERENCES "player"("id") ON DELETE CASCADE ON UPDATE NO ACTION
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_injury_player_id" ON "injury" ("player_id")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_injury_is_recovered" ON "injury" ("is_recovered")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_injury_occurred_at" ON "injury" ("occurred_at")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "injury" DROP CONSTRAINT "FK_injury_player_id"
    `);
    await queryRunner.query(`DROP TABLE "injury"`);
  }
}