import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddLowerLeagueIdToMatch1767000000001 implements MigrationInterface {
  name = 'AddLowerLeagueIdToMatch1767000000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            ALTER TABLE "match" ADD COLUMN IF NOT EXISTS "lower_league_id" uuid
        `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn('match', 'lower_league_id');
  }
}
