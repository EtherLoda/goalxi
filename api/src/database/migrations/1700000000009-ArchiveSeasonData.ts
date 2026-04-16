import { MigrationInterface, QueryRunner } from 'typeorm';

export class ArchiveSeasonData1700000000009 implements MigrationInterface {
  name = 'ArchiveSeasonData1700000000009';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // archived_season_result
    await queryRunner.query(`
      CREATE TABLE "archived_season_result" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "team_id" uuid NOT NULL,
        "league_id" uuid NOT NULL,
        "season" integer NOT NULL,
        "final_position" integer NOT NULL,
        "points" integer NOT NULL DEFAULT 0,
        "wins" integer NOT NULL DEFAULT 0,
        "draws" integer NOT NULL DEFAULT 0,
        "losses" integer NOT NULL DEFAULT 0,
        "goals_for" integer NOT NULL DEFAULT 0,
        "goals_against" integer NOT NULL DEFAULT 0,
        "goal_difference" integer NOT NULL DEFAULT 0,
        "promoted" boolean NOT NULL DEFAULT false,
        "relegated" boolean NOT NULL DEFAULT false,
        "archived_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_archived_season_result_id" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_archived_season_result_league_season_position"
      ON "archived_season_result" ("season", "league_id", "final_position")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_archived_season_result_team_season"
      ON "archived_season_result" ("team_id", "season")
    `);

    await queryRunner.query(`
      ALTER TABLE "archived_season_result"
      ADD CONSTRAINT "FK_archived_season_result_team"
      FOREIGN KEY ("team_id") REFERENCES "team"("id") ON DELETE CASCADE
    `);

    await queryRunner.query(`
      ALTER TABLE "archived_season_result"
      ADD CONSTRAINT "FK_archived_season_result_league"
      FOREIGN KEY ("league_id") REFERENCES "league"("id") ON DELETE CASCADE
    `);

    // archived_player_competition_stats
    await queryRunner.query(`
      CREATE TABLE "archived_player_competition_stats" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "player_id" uuid NOT NULL,
        "league_id" uuid NOT NULL,
        "season" integer NOT NULL,
        "goals" integer NOT NULL DEFAULT 0,
        "assists" integer NOT NULL DEFAULT 0,
        "tackles" integer NOT NULL DEFAULT 0,
        "yellow_cards" integer NOT NULL DEFAULT 0,
        "red_cards" integer NOT NULL DEFAULT 0,
        "starts" integer NOT NULL DEFAULT 0,
        "substitute_appearances" integer NOT NULL DEFAULT 0,
        "appearances" integer NOT NULL DEFAULT 0,
        "archived_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_archived_player_competition_stats_id" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_archived_player_competition_stats_player_season"
      ON "archived_player_competition_stats" ("player_id", "season")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_archived_player_competition_stats_goals"
      ON "archived_player_competition_stats" ("league_id", "season", "goals" DESC)
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_archived_player_competition_stats_assists"
      ON "archived_player_competition_stats" ("league_id", "season", "assists" DESC)
    `);

    await queryRunner.query(`
      ALTER TABLE "archived_player_competition_stats"
      ADD CONSTRAINT "FK_archived_player_competition_stats_player"
      FOREIGN KEY ("player_id") REFERENCES "player"("id") ON DELETE CASCADE
    `);

    await queryRunner.query(`
      ALTER TABLE "archived_player_competition_stats"
      ADD CONSTRAINT "FK_archived_player_competition_stats_league"
      FOREIGN KEY ("league_id") REFERENCES "league"("id") ON DELETE CASCADE
    `);

    // archived_transaction
    await queryRunner.query(`
      CREATE TABLE "archived_transaction" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "team_id" uuid NOT NULL,
        "season" integer NOT NULL,
        "amount" integer NOT NULL,
        "type" varchar NOT NULL,
        "description" varchar,
        "related_id" uuid,
        "archived_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_archived_transaction_id" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_archived_transaction_team_season"
      ON "archived_transaction" ("team_id", "season")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_archived_transaction_season_type"
      ON "archived_transaction" ("season", "type")
    `);

    await queryRunner.query(`
      ALTER TABLE "archived_transaction"
      ADD CONSTRAINT "FK_archived_transaction_team"
      FOREIGN KEY ("team_id") REFERENCES "team"("id") ON DELETE CASCADE
    `);

    // archived_player_event
    await queryRunner.query(`
      CREATE TABLE "archived_player_event" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "player_id" uuid NOT NULL,
        "season" integer NOT NULL,
        "date" TIMESTAMPTZ NOT NULL,
        "event_type" varchar(50) NOT NULL,
        "icon" varchar(100),
        "title_key" varchar(255),
        "match_id" uuid,
        "title_data" jsonb,
        "details" jsonb,
        "archived_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_archived_player_event_id" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_archived_player_event_player_season"
      ON "archived_player_event" ("player_id", "season")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_archived_player_event_player_event_type"
      ON "archived_player_event" ("player_id", "event_type")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_archived_player_event_season_event_type"
      ON "archived_player_event" ("season", "event_type")
    `);

    await queryRunner.query(`
      ALTER TABLE "archived_player_event"
      ADD CONSTRAINT "FK_archived_player_event_player"
      FOREIGN KEY ("player_id") REFERENCES "player"("id") ON DELETE CASCADE
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "archived_player_event" DROP CONSTRAINT IF EXISTS "FK_archived_player_event_player"`,
    );
    await queryRunner.query(`DROP TABLE "archived_player_event"`);

    await queryRunner.query(
      `ALTER TABLE "archived_transaction" DROP CONSTRAINT IF EXISTS "FK_archived_transaction_team"`,
    );
    await queryRunner.query(`DROP TABLE "archived_transaction"`);

    await queryRunner.query(
      `ALTER TABLE "archived_player_competition_stats" DROP CONSTRAINT IF EXISTS "FK_archived_player_competition_stats_league"`,
    );
    await queryRunner.query(
      `ALTER TABLE "archived_player_competition_stats" DROP CONSTRAINT IF EXISTS "FK_archived_player_competition_stats_player"`,
    );
    await queryRunner.query(`DROP TABLE "archived_player_competition_stats"`);

    await queryRunner.query(
      `ALTER TABLE "archived_season_result" DROP CONSTRAINT IF EXISTS "FK_archived_season_result_league"`,
    );
    await queryRunner.query(
      `ALTER TABLE "archived_season_result" DROP CONSTRAINT IF EXISTS "FK_archived_season_result_team"`,
    );
    await queryRunner.query(`DROP TABLE "archived_season_result"`);
  }
}
