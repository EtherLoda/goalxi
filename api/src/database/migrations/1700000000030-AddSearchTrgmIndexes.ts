import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSearchTrgmIndexes1700000000030 implements MigrationInterface {
  name = 'AddSearchTrgmIndexes1700000000030';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Enable pg_trgm extension
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS pg_trgm`);

    // Add GIN trgm indexes for search optimization (without CONCURRENTLY for migration compatibility)
    await queryRunner.query(`
      CREATE INDEX "idx_team_name_trgm" ON "team" USING GIN (name gin_trgm_ops)
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_player_name_trgm" ON "player" USING GIN (name gin_trgm_ops)
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_league_name_trgm" ON "league" USING GIN (name gin_trgm_ops)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_team_name_trgm"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_player_name_trgm"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_league_name_trgm"`);
  }
}
