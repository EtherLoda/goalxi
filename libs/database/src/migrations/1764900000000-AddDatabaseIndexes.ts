import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddDatabaseIndexes1764900000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Match table indexes
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_match_league_season_week" 
      ON "match" ("league_id", "season", "week")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_match_home_team" 
      ON "match" ("home_team_id")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_match_away_team" 
      ON "match" ("away_team_id")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_match_status" 
      ON "match" ("status")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_match_scheduled_at" 
      ON "match" ("scheduled_at")
    `);

    // Match tactics indexes
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_match_tactics_match_team" 
      ON "match_tactics" ("match_id", "team_id")
    `);

    // Match events indexes  
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_match_event_match" 
      ON "match_event" ("match_id")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_match_event_match_minute" 
      ON "match_event" ("match_id", "minute", "second")
    `);

    // Match team stats indexes
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_match_team_stats_match_team" 
      ON "match_team_stats" ("match_id", "team_id")
    `);

    // Tactics preset indexes
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_tactics_preset_team" 
      ON "tactics_preset" ("team_id")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_tactics_preset_team_default" 
      ON "tactics_preset" ("team_id", "is_default")
    `);

    // Team indexes
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_team_user" 
      ON "team" ("user_id")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_team_league" 
      ON "team" ("league_id")
    `);

    // Player indexes
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_player_team" 
      ON "player" ("team_id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop all indexes
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_match_league_season_week"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_match_home_team"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_match_away_team"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_match_status"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_match_scheduled_at"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_match_tactics_match_team"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_match_event_match"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_match_event_match_minute"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_match_team_stats_match_team"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_tactics_preset_team"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_tactics_preset_team_default"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_team_user"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_team_league"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_player_team"`);
  }
}
