import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddRoundToMatch1700000000010 implements MigrationInterface {
  name = 'AddRoundToMatch1700000000010';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "match"
      ADD COLUMN "round" integer
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_match_league_season_round"
      ON "match" ("league_id", "season", "round")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX "IDX_match_league_season_round"
    `);

    await queryRunner.query(`
      ALTER TABLE "match" DROP COLUMN "round"
    `);
  }
}
