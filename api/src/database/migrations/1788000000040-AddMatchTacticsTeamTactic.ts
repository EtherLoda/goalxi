import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds `team_tactic` (varchar(20), nullable) to `match_tactics`.
 *
 * ## Why
 *
 * The five team tactics (`TeamTacticCode`) are a second, independent layer
 * on top of the tempo / pitchWidth / defensiveLine dimensions that this
 * table already stores. Without a column the choice cannot survive the trip
 * from the API to `simulation.processor.ts`, which is the only place that
 * builds `TacticsConfig` for the engine.
 *
 * ## Why nullable, no backfill
 *
 * `NULL` means "no team tactic", which is exactly the behaviour every
 * existing row already has in the engine: `resolveTeamTacticStyle(null)`
 * returns the all-neutral style, bit-identical to the pre-feature engine.
 * Backfilling a default would silently rewrite the tactics of matches that
 * were submitted before the feature existed.
 *
 * ## Why varchar and not a Postgres enum
 *
 * The tactic codes are product-level identifiers that may be added or
 * renamed. Dropping / adding a value on PG 16 requires the whole
 * swap-the-enum-type dance that `1724000000000-RemoveYouthCoachRole` needed,
 * and the read path already tolerates an unknown value (the engine resolves
 * an unrecognised code to the neutral style). A varchar keeps the migration
 * to one statement.
 *
 * ## Idempotency
 *
 * `ADD COLUMN IF NOT EXISTS` / `DROP COLUMN IF EXISTS`, so a re-run or a
 * partially applied migration is harmless.
 */
export class AddMatchTacticsTeamTactic1788000000040 implements MigrationInterface {
  name = 'AddMatchTacticsTeamTactic1788000000040';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "match_tactics"
      ADD COLUMN IF NOT EXISTS "team_tactic" varchar(20)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "match_tactics"
      DROP COLUMN IF EXISTS "team_tactic"
    `);
  }
}
