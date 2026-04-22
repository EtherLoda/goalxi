import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddWeekToTransaction1700000000011 implements MigrationInterface {
  name = 'AddWeekToTransaction1700000000011';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "transaction"
      ADD COLUMN "week" integer NOT NULL DEFAULT 1
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "transaction" DROP COLUMN "week"
    `);
  }
}
