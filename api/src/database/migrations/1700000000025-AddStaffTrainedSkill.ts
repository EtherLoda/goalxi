import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddStaffTrainedSkill1700000000025 implements MigrationInterface {
  name = 'AddStaffTrainedSkill1700000000025';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "staff" ADD COLUMN IF NOT EXISTS "trained_skill" varchar(50)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "staff" DROP COLUMN IF EXISTS "trained_skill"
    `);
  }
}
