import { MigrationInterface, QueryRunner } from 'typeorm';

export class RemoveAppearanceAndPotentialTier1718000000000 implements MigrationInterface {
  name = 'RemoveAppearanceAndPotentialTier1718000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Drop potential_tier enum type first (if no other columns use it)
    await queryRunner.query(`
      ALTER TABLE "player" DROP COLUMN IF EXISTS "appearance"
    `);

    await queryRunner.query(`
      ALTER TABLE "player" DROP COLUMN IF EXISTS "potential_tier"
    `);

    // Drop enum type if exists
    await queryRunner.query(`
      DROP TYPE IF EXISTS "potential_tier" CASCADE
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Add back columns and enum
    await queryRunner.query(`
      ALTER TABLE "player" ADD COLUMN "appearance" jsonb DEFAULT '{}'
    `);

    await queryRunner.query(`
      CREATE TYPE "potential_tier" AS ENUM ('LOW', 'REGULAR', 'HIGH_PRO', 'ELITE', 'LEGEND')
    `);

    await queryRunner.query(`
      ALTER TABLE "player" ADD COLUMN "potential_tier" "potential_tier" DEFAULT 'LOW'
    `);
  }
}
