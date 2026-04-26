import { MigrationInterface, QueryRunner } from 'typeorm';

export class RenameTrainingToStaminaFields1700000000023 implements MigrationInterface {
  name = 'RenameTrainingToStaminaFields1700000000023';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Rename training_physical_intensity to stamina_training_intensity in team table
    await queryRunner.query(`
      ALTER TABLE "team"
      RENAME COLUMN "training_physical_intensity" TO "stamina_training_intensity"
    `);

    // Drop training_slot, training_category, training_skill from player table
    await queryRunner.query(`
      ALTER TABLE "player"
      DROP COLUMN IF EXISTS "training_slot"
    `);

    await queryRunner.query(`
      ALTER TABLE "player"
      DROP COLUMN IF EXISTS "training_category"
    `);

    await queryRunner.query(`
      ALTER TABLE "player"
      DROP COLUMN IF EXISTS "training_skill"
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Restore training_physical_intensity in team table
    await queryRunner.query(`
      ALTER TABLE "team"
      RENAME COLUMN "stamina_training_intensity" TO "training_physical_intensity"
    `);

    // Re-add training columns to player table
    await queryRunner.query(`
      ALTER TABLE "player"
      ADD COLUMN "training_slot" enum('ENHANCED', 'REGULAR', 'NONE') NOT NULL DEFAULT 'REGULAR'
    `);

    await queryRunner.query(`
      ALTER TABLE "player"
      ADD COLUMN "training_category" enum('physical', 'technical', 'mental', 'setPieces', 'goalkeeper') NOT NULL DEFAULT 'physical'
    `);

    await queryRunner.query(`
      ALTER TABLE "player"
      ADD COLUMN "training_skill" varchar(20)
    `);
  }
}
