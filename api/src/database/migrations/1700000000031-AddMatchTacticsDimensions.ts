import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddMatchTacticsDimensions1700000000031 implements MigrationInterface {
  name = 'AddMatchTacticsDimensions1700000000031';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add columns to match_tactics table
    await queryRunner.query(`
      ALTER TABLE "match_tactics"
      ADD COLUMN IF NOT EXISTS "tempo" varchar(10) NOT NULL DEFAULT 'balanced'
    `);

    await queryRunner.query(`
      ALTER TABLE "match_tactics"
      ADD COLUMN IF NOT EXISTS "pitchWidth" varchar(10) NOT NULL DEFAULT 'balanced'
    `);

    await queryRunner.query(`
      ALTER TABLE "match_tactics"
      ADD COLUMN IF NOT EXISTS "defensiveLine" varchar(10) NOT NULL DEFAULT 'mid'
    `);

    // Add columns to youth_match_tactics table
    await queryRunner.query(`
      ALTER TABLE "youth_match_tactics"
      ADD COLUMN IF NOT EXISTS "tempo" varchar(10) NOT NULL DEFAULT 'balanced'
    `);

    await queryRunner.query(`
      ALTER TABLE "youth_match_tactics"
      ADD COLUMN IF NOT EXISTS "pitchWidth" varchar(10) NOT NULL DEFAULT 'balanced'
    `);

    await queryRunner.query(`
      ALTER TABLE "youth_match_tactics"
      ADD COLUMN IF NOT EXISTS "defensiveLine" varchar(10) NOT NULL DEFAULT 'mid'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop columns from youth_match_tactics table
    await queryRunner.query(`
      ALTER TABLE "youth_match_tactics" DROP COLUMN IF EXISTS "defensiveLine"
    `);

    await queryRunner.query(`
      ALTER TABLE "youth_match_tactics" DROP COLUMN IF EXISTS "pitchWidth"
    `);

    await queryRunner.query(`
      ALTER TABLE "youth_match_tactics" DROP COLUMN IF EXISTS "tempo"
    `);

    // Drop columns from match_tactics table
    await queryRunner.query(`
      ALTER TABLE "match_tactics" DROP COLUMN IF EXISTS "defensiveLine"
    `);

    await queryRunner.query(`
      ALTER TABLE "match_tactics" DROP COLUMN IF EXISTS "pitchWidth"
    `);

    await queryRunner.query(`
      ALTER TABLE "match_tactics" DROP COLUMN IF EXISTS "tempo"
    `);
  }
}
