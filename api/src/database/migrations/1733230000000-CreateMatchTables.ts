import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateMatchTables1733230000000 implements MigrationInterface {
    name = 'CreateMatchTables1733230000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Update match table with new fields
        await queryRunner.query(`
            ALTER TABLE "match" 
            DROP COLUMN IF EXISTS "match_date",
            DROP COLUMN IF EXISTS "match_type",
            DROP COLUMN IF EXISTS "league_id",
            ADD COLUMN "league_id" UUID,
            ADD COLUMN IF NOT EXISTS "season" INT NOT NULL DEFAULT 1,
            ADD COLUMN IF NOT EXISTS "week" INT NOT NULL DEFAULT 1,
            ADD COLUMN IF NOT EXISTS "scheduled_at" TIMESTAMP NOT NULL DEFAULT NOW(),
            ADD COLUMN IF NOT EXISTS "status" VARCHAR(20) NOT NULL DEFAULT 'scheduled',
            ADD COLUMN IF NOT EXISTS "type" VARCHAR(30) NOT NULL DEFAULT 'league',
            ADD COLUMN IF NOT EXISTS "simulation_completed_at" TIMESTAMP,
            ALTER COLUMN "home_score" DROP NOT NULL,
            ALTER COLUMN "home_score" DROP DEFAULT,
            ALTER COLUMN "away_score" DROP NOT NULL,
            ALTER COLUMN "away_score" DROP DEFAULT,
            ALTER COLUMN "home_team_id" TYPE UUID USING "home_team_id"::uuid,
            ALTER COLUMN "away_team_id" TYPE UUID USING "away_team_id"::uuid
        `);

        // Add foreign key for league_id
        await queryRunner.query(`
            ALTER TABLE "match"
            ADD CONSTRAINT "FK_match_league" FOREIGN KEY("league_id") REFERENCES "league"("id")
        `);

        // Create indexes for match table
        await queryRunner.query(`
            CREATE INDEX IF NOT EXISTS "IDX_match_league_season_week" ON "match"("league_id", "season", "week")
        `);
        await queryRunner.query(`
            CREATE INDEX IF NOT EXISTS "IDX_match_home_team" ON "match"("home_team_id")
        `);
        await queryRunner.query(`
            CREATE INDEX IF NOT EXISTS "IDX_match_away_team" ON "match"("away_team_id")
        `);

        // Create tactics_preset table
        await queryRunner.query(`
            CREATE TABLE "tactics_preset"(
                "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                "team_id" UUID NOT NULL,
                "name" VARCHAR(100) NOT NULL,
                "is_default" BOOLEAN DEFAULT false,
                "formation" VARCHAR(10) NOT NULL,
                "lineup" JSONB NOT NULL,
                "instructions" JSONB,
                "substitutions" JSONB,
                "created_at" TIMESTAMP DEFAULT NOW(),
                "updated_at" TIMESTAMP DEFAULT NOW(),
                CONSTRAINT "FK_tactics_preset_team" FOREIGN KEY("team_id") REFERENCES "team"("id") ON DELETE CASCADE,
                CONSTRAINT "UQ_tactics_preset_team_name" UNIQUE("team_id", "name")
            )
        `);

        await queryRunner.query(`
            CREATE INDEX "IDX_tactics_preset_team_default" ON "tactics_preset"("team_id", "is_default")
        `);

        // Create match_tactics table
        await queryRunner.query(`
            CREATE TABLE "match_tactics"(
                "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                "match_id" UUID NOT NULL,
                "team_id" UUID NOT NULL,
                "preset_id" UUID,
                "formation" VARCHAR(10) NOT NULL,
                "lineup" JSONB NOT NULL,
                "instructions" JSONB,
                "substitutions" JSONB,
                "submitted_at" TIMESTAMP NOT NULL,
                "created_at" TIMESTAMP DEFAULT NOW(),
                "updated_at" TIMESTAMP DEFAULT NOW(),
                CONSTRAINT "FK_match_tactics_match" FOREIGN KEY("match_id") REFERENCES "match"("id") ON DELETE CASCADE,
                CONSTRAINT "FK_match_tactics_team" FOREIGN KEY("team_id") REFERENCES "team"("id"),
                CONSTRAINT "FK_match_tactics_preset" FOREIGN KEY("preset_id") REFERENCES "tactics_preset"("id"),
                CONSTRAINT "UQ_match_tactics_match_team" UNIQUE("match_id", "team_id")
            )
        `);

        // Create match_event table
        await queryRunner.query(`
            CREATE TABLE "match_event"(
                "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                "match_id" UUID NOT NULL,
                "minute" INT NOT NULL,
                "second" INT DEFAULT 0,
                "type" INT NOT NULL,
                "type_name" VARCHAR(100) NOT NULL,
                "team_id" UUID,
                "player_id" UUID,
                "related_player_id" UUID,
                "data" JSONB,
                "created_at" TIMESTAMP DEFAULT NOW(),
                CONSTRAINT "FK_match_event_match" FOREIGN KEY("match_id") REFERENCES "match"("id") ON DELETE CASCADE,
                CONSTRAINT "FK_match_event_team" FOREIGN KEY("team_id") REFERENCES "team"("id"),
                CONSTRAINT "FK_match_event_player" FOREIGN KEY("player_id") REFERENCES "player"("id"),
                CONSTRAINT "FK_match_event_related_player" FOREIGN KEY("related_player_id") REFERENCES "player"("id")
            )
        `);

        await queryRunner.query(`
            CREATE INDEX "IDX_match_event_match_minute_second" ON "match_event"("match_id", "minute", "second")
        `);

        // Create match_team_stats table
        await queryRunner.query(`
            CREATE TABLE "match_team_stats"(
                "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                "match_id" UUID NOT NULL,
                "team_id" UUID NOT NULL,
                "possession_percentage" DECIMAL(5, 2),
                "shots" INT DEFAULT 0,
                "shots_on_target" INT DEFAULT 0,
                "corners" INT DEFAULT 0,
                "fouls" INT DEFAULT 0,
                "offsides" INT DEFAULT 0,
                "yellow_cards" INT DEFAULT 0,
                "red_cards" INT DEFAULT 0,
                "passes_completed" INT DEFAULT 0,
                "passes_attempted" INT DEFAULT 0,
                "created_at" TIMESTAMP DEFAULT NOW(),
                "updated_at" TIMESTAMP DEFAULT NOW(),
                CONSTRAINT "FK_match_team_stats_match" FOREIGN KEY("match_id") REFERENCES "match"("id") ON DELETE CASCADE,
                CONSTRAINT "FK_match_team_stats_team" FOREIGN KEY("team_id") REFERENCES "team"("id"),
                CONSTRAINT "UQ_match_team_stats_match_team" UNIQUE("match_id", "team_id")
            )
        `);

        // Add career_stats column to player table
        await queryRunner.query(`
            ALTER TABLE "player"
            ADD COLUMN IF NOT EXISTS "career_stats" JSONB DEFAULT '{}'::jsonb
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Drop career_stats column from player table
        await queryRunner.query(`
            ALTER TABLE "player"
            DROP COLUMN IF EXISTS "career_stats"
        `);

        // Drop match_team_stats table
        await queryRunner.query(`DROP TABLE IF EXISTS "match_team_stats"`);

        // Drop match_event table
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_match_event_match_minute_second"`);
        await queryRunner.query(`DROP TABLE IF EXISTS "match_event"`);

        // Drop match_tactics table
        await queryRunner.query(`DROP TABLE IF EXISTS "match_tactics"`);

        // Drop tactics_preset table
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_tactics_preset_team_default"`);
        await queryRunner.query(`DROP TABLE IF EXISTS "tactics_preset"`);

        // Revert match table changes
        await queryRunner.query(`
            DROP INDEX IF EXISTS "IDX_match_away_team"
        `);
        await queryRunner.query(`
            DROP INDEX IF EXISTS "IDX_match_home_team"
        `);
        await queryRunner.query(`
            DROP INDEX IF EXISTS "IDX_match_league_season_week"
        `);
        await queryRunner.query(`
            ALTER TABLE "match"
            DROP CONSTRAINT IF EXISTS "FK_match_league"
        `);
        await queryRunner.query(`
            ALTER TABLE "match"
            DROP COLUMN IF EXISTS "simulation_completed_at",
            DROP COLUMN IF EXISTS "type",
            DROP COLUMN IF EXISTS "status",
            DROP COLUMN IF EXISTS "scheduled_at",
            DROP COLUMN IF EXISTS "week",
            DROP COLUMN IF EXISTS "season",
            DROP COLUMN IF EXISTS "league_id",
            ADD COLUMN IF NOT EXISTS "match_date" TIMESTAMPTZ,
            ADD COLUMN IF NOT EXISTS "match_type" VARCHAR DEFAULT 'league',
            ALTER COLUMN "home_score" SET DEFAULT 0,
            ALTER COLUMN "home_score" SET NOT NULL,
            ALTER COLUMN "away_score" SET DEFAULT 0,
            ALTER COLUMN "away_score" SET NOT NULL
        `);
    }
}
