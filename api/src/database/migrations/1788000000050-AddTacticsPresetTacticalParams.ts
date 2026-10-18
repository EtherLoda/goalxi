import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds the four tactical parameters to `tactics_preset`:
 * `tempo`, `pitchWidth`, `defensiveLine` and `team_tactic`.
 *
 * ## Why
 *
 * A preset only saved formation / lineup / instructions / substitutions.
 * Applying one therefore restored the eleven players but silently kept
 * whatever the match row already had for the three dimensions, and there was
 * nowhere at all to store a team tactic. That made a preset a lineup
 * bookmark rather than a tactical setup — a player who tuned "窄 + 慢 + 双翼
 * 齐飞" had to re-pick all four every match.
 *
 * ## Why the dimensions are NOT NULL with defaults
 *
 * They mirror `match_tactics` exactly (`1700000000031` used the same shapes
 * and the same 'balanced'/'balanced'/'mid' defaults). Giving existing rows
 * the defaults is not a behaviour change: those rows were saved when the
 * columns did not exist, and every match row they were ever applied to was
 * created with exactly these defaults. So after this migration a preset is a
 * complete snapshot, and applying one restores all four.
 *
 * `team_tactic` is nullable because `NULL` there means "no team tactic",
 * which is a real choice rather than a missing value — same reasoning as
 * `1788000000040` for `match_tactics`.
 *
 * ## Idempotency
 *
 * `ADD COLUMN IF NOT EXISTS` / `DROP COLUMN IF EXISTS` throughout.
 */
export class AddTacticsPresetTacticalParams1788000000050 implements MigrationInterface {
  name = 'AddTacticsPresetTacticalParams1788000000050';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "tactics_preset"
      ADD COLUMN IF NOT EXISTS "tempo" varchar(10) NOT NULL DEFAULT 'balanced'
    `);
    await queryRunner.query(`
      ALTER TABLE "tactics_preset"
      ADD COLUMN IF NOT EXISTS "pitchWidth" varchar(10) NOT NULL DEFAULT 'balanced'
    `);
    await queryRunner.query(`
      ALTER TABLE "tactics_preset"
      ADD COLUMN IF NOT EXISTS "defensiveLine" varchar(10) NOT NULL DEFAULT 'mid'
    `);
    await queryRunner.query(`
      ALTER TABLE "tactics_preset"
      ADD COLUMN IF NOT EXISTS "team_tactic" varchar(20)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "tactics_preset" DROP COLUMN IF EXISTS "team_tactic"
    `);
    await queryRunner.query(`
      ALTER TABLE "tactics_preset" DROP COLUMN IF EXISTS "defensiveLine"
    `);
    await queryRunner.query(`
      ALTER TABLE "tactics_preset" DROP COLUMN IF EXISTS "pitchWidth"
    `);
    await queryRunner.query(`
      ALTER TABLE "tactics_preset" DROP COLUMN IF EXISTS "tempo"
    `);
  }
}
