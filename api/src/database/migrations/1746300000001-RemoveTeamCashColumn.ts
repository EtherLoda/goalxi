import { MigrationInterface, QueryRunner } from 'typeorm';

export class RemoveTeamCashColumn1746300000001 implements MigrationInterface {
  name = 'RemoveTeamCashColumn1746300000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // TeamEntity.cash column is no longer needed - FinanceEntity.balance is the source of truth
    await queryRunner.query(`
      ALTER TABLE "team" DROP COLUMN IF EXISTS "cash"
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "team" ADD COLUMN "cash" integer NOT NULL DEFAULT 500000
    `);
  }
}
