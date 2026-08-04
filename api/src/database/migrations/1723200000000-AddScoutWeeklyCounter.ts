import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Add per-team weekly scout draw counter.
 *
 * `scout_draws_this_week` is incremented on every manual draw and
 * reset to 0 by `ScoutsService.generateOneCandidate` whenever
 * `scout_week_index` falls behind the current `currentWeekIndex()`.
 * The auto-cron on Saturday does not consume this counter — it's
 * strictly the manager's manual draws.
 */
export class AddScoutWeeklyCounter1723200000000 implements MigrationInterface {
  name = 'AddScoutWeeklyCounter1723200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "team"
        ADD COLUMN IF NOT EXISTS "scout_draws_this_week" integer NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS "scout_week_index" integer NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "team"
        DROP COLUMN IF EXISTS "scout_week_index",
        DROP COLUMN IF EXISTS "scout_draws_this_week"
    `);
  }
}
