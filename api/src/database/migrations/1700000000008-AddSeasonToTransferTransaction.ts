import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSeasonToTransferTransaction1700000000008 implements MigrationInterface {
  name = 'AddSeasonToTransferTransaction1700000000008';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "transfer_transaction"
      ADD COLUMN "season" integer NOT NULL DEFAULT 1
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "transfer_transaction" DROP COLUMN "season"
    `);
  }
}
