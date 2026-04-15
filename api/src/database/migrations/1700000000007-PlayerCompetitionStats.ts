import { MigrationInterface, QueryRunner } from 'typeorm';

export class PlayerCompetitionStats1700000000007 implements MigrationInterface {
  name = 'PlayerCompetitionStats1700000000007';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "player_competition_stats" (
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
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_player_competition_stats_id" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_player_competition_stats_league_season_player"
      ON "player_competition_stats" ("league_id", "season", "player_id")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_player_competition_stats_goals"
      ON "player_competition_stats" ("league_id", "season", "goals" DESC)
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_player_competition_stats_assists"
      ON "player_competition_stats" ("league_id", "season", "assists" DESC)
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_player_competition_stats_tackles"
      ON "player_competition_stats" ("league_id", "season", "tackles" DESC)
    `);

    await queryRunner.query(`
      ALTER TABLE "player_competition_stats"
      ADD CONSTRAINT "FK_player_competition_stats_player"
      FOREIGN KEY ("player_id") REFERENCES "player"("id") ON DELETE CASCADE
    `);

    await queryRunner.query(`
      ALTER TABLE "player_competition_stats"
      ADD CONSTRAINT "FK_player_competition_stats_league"
      FOREIGN KEY ("league_id") REFERENCES "league"("id") ON DELETE CASCADE
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "player_competition_stats" DROP CONSTRAINT IF EXISTS "FK_player_competition_stats_league"`,
    );
    await queryRunner.query(
      `ALTER TABLE "player_competition_stats" DROP CONSTRAINT IF EXISTS "FK_player_competition_stats_player"`,
    );
    await queryRunner.query(`DROP TABLE "player_competition_stats"`);
  }
}
