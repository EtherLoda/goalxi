import { MigrationInterface, QueryRunner } from "typeorm";

export class InitialSchema1764595173536 implements MigrationInterface {
    name = 'InitialSchema1764595173536'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Enable UUID extension
        await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);

        // Create user table
        await queryRunner.query(`
            CREATE TABLE "user" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "username" character varying(50),
                "email" character varying NOT NULL,
                "password" character varying NOT NULL,
                "bio" character varying NOT NULL DEFAULT '',
                "nickname" character varying(50),
                "avatar" character varying NOT NULL DEFAULT '',
                "supporter_level" integer NOT NULL DEFAULT '0',
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "deleted_at" TIMESTAMP WITH TIME ZONE,
                CONSTRAINT "PK_user_id" PRIMARY KEY ("id")
            )
        `);

        await queryRunner.query(`
            CREATE UNIQUE INDEX "UQ_user_username" ON "user" ("username") WHERE "deleted_at" IS NULL
        `);

        await queryRunner.query(`
            CREATE UNIQUE INDEX "UQ_user_email" ON "user" ("email") WHERE "deleted_at" IS NULL
        `);

        // Create session table
        await queryRunner.query(`
            CREATE TABLE "session" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "user_id" uuid NOT NULL,
                "hash" character varying NOT NULL,
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "deleted_at" TIMESTAMP WITH TIME ZONE,
                CONSTRAINT "PK_session_id" PRIMARY KEY ("id")
            )
        `);

        await queryRunner.query(`
            ALTER TABLE "session" ADD CONSTRAINT "FK_session_user" 
            FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);

        // Create league table
        await queryRunner.query(`
            CREATE TABLE "league" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "name" character varying NOT NULL,
                "tier" integer NOT NULL DEFAULT '1',
                "division" integer NOT NULL DEFAULT '1',
                "status" character varying NOT NULL DEFAULT 'active',
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "deleted_at" TIMESTAMP WITH TIME ZONE,
                CONSTRAINT "PK_league_id" PRIMARY KEY ("id")
            )
        `);

        // Create team table
        await queryRunner.query(`
            CREATE TABLE "team" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "user_id" uuid NOT NULL,
                "league_id" uuid,
                "name" character varying NOT NULL,
                "logo_url" character varying NOT NULL DEFAULT '',
                "jersey_color_primary" character varying NOT NULL DEFAULT '#FF0000',
                "jersey_color_secondary" character varying NOT NULL DEFAULT '#FFFFFF',
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "deleted_at" TIMESTAMP WITH TIME ZONE,
                CONSTRAINT "PK_team_id" PRIMARY KEY ("id"),
                CONSTRAINT "UQ_team_user" UNIQUE ("user_id")
            )
        `);

        await queryRunner.query(`
            CREATE INDEX "IDX_team_league" ON "team" ("league_id")
        `);

        await queryRunner.query(`
            ALTER TABLE "team" ADD CONSTRAINT "FK_team_user" 
            FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);

        await queryRunner.query(`
            ALTER TABLE "team" ADD CONSTRAINT "FK_team_league" 
            FOREIGN KEY ("league_id") REFERENCES "league"("id") ON DELETE SET NULL ON UPDATE NO ACTION
        `);

        // Create player table
        await queryRunner.query(`
            CREATE TABLE "player" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "team_id" uuid,
                "name" character varying NOT NULL,
                "birthday" date,
                "appearance" jsonb NOT NULL,
                "position" character varying,
                "is_goalkeeper" boolean NOT NULL DEFAULT false,
                "on_transfer" boolean NOT NULL DEFAULT false,
                "attributes" jsonb NOT NULL,
                "experience" double precision NOT NULL DEFAULT '0',
                "form" integer NOT NULL DEFAULT '5',
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "deleted_at" TIMESTAMP WITH TIME ZONE,
                CONSTRAINT "PK_player_id" PRIMARY KEY ("id")
            )
        `);

        await queryRunner.query(`
            ALTER TABLE "player" ADD CONSTRAINT "FK_player_team" 
            FOREIGN KEY ("team_id") REFERENCES "team"("id") ON DELETE SET NULL ON UPDATE NO ACTION
        `);

        // Create finance table
        await queryRunner.query(`
            CREATE TABLE "finance" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "team_id" uuid NOT NULL,
                "balance" integer NOT NULL DEFAULT '100000',
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                CONSTRAINT "PK_finance_id" PRIMARY KEY ("id"),
                CONSTRAINT "UQ_finance_team" UNIQUE ("team_id")
            )
        `);

        await queryRunner.query(`
            ALTER TABLE "finance" ADD CONSTRAINT "FK_finance_team" 
            FOREIGN KEY ("team_id") REFERENCES "team"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);

        // Create transaction table
        await queryRunner.query(`
            CREATE TABLE "transaction" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "team_id" uuid NOT NULL,
                "season" integer NOT NULL,
                "amount" integer NOT NULL,
                "type" character varying NOT NULL,
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                CONSTRAINT "PK_transaction_id" PRIMARY KEY ("id")
            )
        `);

        await queryRunner.query(`
            ALTER TABLE "transaction" ADD CONSTRAINT "FK_transaction_team" 
            FOREIGN KEY ("team_id") REFERENCES "team"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);

        // Create auction table
        await queryRunner.query(`
            CREATE TABLE "auction" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "player_id" uuid NOT NULL,
                "team_id" uuid NOT NULL,
                "start_price" integer NOT NULL,
                "buyout_price" integer NOT NULL,
                "current_price" integer NOT NULL,
                "current_bidder_id" uuid,
                "started_at" TIMESTAMP WITH TIME ZONE NOT NULL,
                "ends_at" TIMESTAMP WITH TIME ZONE NOT NULL,
                "bid_history" jsonb NOT NULL DEFAULT '[]',
                "status" character varying NOT NULL DEFAULT 'ACTIVE',
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                CONSTRAINT "PK_auction_id" PRIMARY KEY ("id")
            )
        `);

        await queryRunner.query(`
            ALTER TABLE "auction" ADD CONSTRAINT "FK_auction_player" 
            FOREIGN KEY ("player_id") REFERENCES "player"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);

        await queryRunner.query(`
            ALTER TABLE "auction" ADD CONSTRAINT "FK_auction_team" 
            FOREIGN KEY ("team_id") REFERENCES "team"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);

        await queryRunner.query(`
            ALTER TABLE "auction" ADD CONSTRAINT "FK_auction_current_bidder" 
            FOREIGN KEY ("current_bidder_id") REFERENCES "team"("id") ON DELETE SET NULL ON UPDATE NO ACTION
        `);

        // Create player_history table
        await queryRunner.query(`
            CREATE TABLE "player_history" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "player_id" uuid NOT NULL,
                "season" integer NOT NULL,
                "date" TIMESTAMP WITH TIME ZONE NOT NULL,
                "event_type" character varying NOT NULL,
                "details" jsonb,
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                CONSTRAINT "PK_player_history_id" PRIMARY KEY ("id")
            )
        `);

        await queryRunner.query(`
            ALTER TABLE "player_history" ADD CONSTRAINT "FK_player_history_player" 
            FOREIGN KEY ("player_id") REFERENCES "player"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);

        // Create player_transaction table
        await queryRunner.query(`
            CREATE TABLE "player_transaction" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "player_id" uuid NOT NULL,
                "from_team_id" uuid NOT NULL,
                "to_team_id" uuid NOT NULL,
                "price" integer NOT NULL,
                "season" integer NOT NULL,
                "transaction_date" TIMESTAMP WITH TIME ZONE NOT NULL,
                "auction_id" uuid,
                CONSTRAINT "PK_player_transaction_id" PRIMARY KEY ("id")
            )
        `);

        await queryRunner.query(`
            ALTER TABLE "player_transaction" ADD CONSTRAINT "FK_player_transaction_player" 
            FOREIGN KEY ("player_id") REFERENCES "player"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);

        await queryRunner.query(`
            ALTER TABLE "player_transaction" ADD CONSTRAINT "FK_player_transaction_from_team" 
            FOREIGN KEY ("from_team_id") REFERENCES "team"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);

        await queryRunner.query(`
            ALTER TABLE "player_transaction" ADD CONSTRAINT "FK_player_transaction_to_team" 
            FOREIGN KEY ("to_team_id") REFERENCES "team"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);

        await queryRunner.query(`
            ALTER TABLE "player_transaction" ADD CONSTRAINT "FK_player_transaction_auction" 
            FOREIGN KEY ("auction_id") REFERENCES "auction"("id") ON DELETE SET NULL ON UPDATE NO ACTION
        `);

        // Create match table
        await queryRunner.query(`
            CREATE TABLE "match" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "home_team_id" uuid NOT NULL,
                "away_team_id" uuid NOT NULL,
                "home_score" integer NOT NULL DEFAULT '0',
                "away_score" integer NOT NULL DEFAULT '0',
                "match_date" TIMESTAMP WITH TIME ZONE NOT NULL,
                "status" character varying NOT NULL DEFAULT 'scheduled',
                "match_type" character varying NOT NULL DEFAULT 'league',
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                CONSTRAINT "PK_match_id" PRIMARY KEY ("id")
            )
        `);

        await queryRunner.query(`
            ALTER TABLE "match" ADD CONSTRAINT "FK_match_home_team" 
            FOREIGN KEY ("home_team_id") REFERENCES "team"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);

        await queryRunner.query(`
            ALTER TABLE "match" ADD CONSTRAINT "FK_match_away_team" 
            FOREIGN KEY ("away_team_id") REFERENCES "team"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);

        // Create league_standing table
        await queryRunner.query(`
            CREATE TABLE "league_standing" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "league_id" uuid NOT NULL,
                "team_id" uuid NOT NULL,
                "season" integer NOT NULL DEFAULT '1',
                "position" integer NOT NULL DEFAULT '0',
                "points" integer NOT NULL DEFAULT '0',
                "wins" integer NOT NULL DEFAULT '0',
                "draws" integer NOT NULL DEFAULT '0',
                "losses" integer NOT NULL DEFAULT '0',
                "goals_for" integer NOT NULL DEFAULT '0',
                "goals_against" integer NOT NULL DEFAULT '0',
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                CONSTRAINT "PK_league_standing_id" PRIMARY KEY ("id"),
                CONSTRAINT "UQ_league_standing_league_team" UNIQUE ("league_id", "team_id")
            )
        `);

        await queryRunner.query(`
            ALTER TABLE "league_standing" ADD CONSTRAINT "FK_league_standing_league" 
            FOREIGN KEY ("league_id") REFERENCES "league"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);

        await queryRunner.query(`
            ALTER TABLE "league_standing" ADD CONSTRAINT "FK_league_standing_team" 
            FOREIGN KEY ("team_id") REFERENCES "team"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);

        // Create season_result table
        await queryRunner.query(`
            CREATE TABLE "season_result" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "team_id" uuid NOT NULL,
                "season" integer NOT NULL,
                "position" integer NOT NULL,
                "points" integer NOT NULL,
                "wins" integer NOT NULL,
                "draws" integer NOT NULL,
                "losses" integer NOT NULL,
                "goals_for" integer NOT NULL,
                "goals_against" integer NOT NULL,
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                CONSTRAINT "PK_season_result_id" PRIMARY KEY ("id")
            )
        `);

        await queryRunner.query(`
            ALTER TABLE "season_result" ADD CONSTRAINT "FK_season_result_team" 
            FOREIGN KEY ("team_id") REFERENCES "team"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Drop all foreign keys first
        await queryRunner.query(`ALTER TABLE "season_result" DROP CONSTRAINT "FK_season_result_team"`);
        await queryRunner.query(`ALTER TABLE "league_standing" DROP CONSTRAINT "FK_league_standing_team"`);
        await queryRunner.query(`ALTER TABLE "league_standing" DROP CONSTRAINT "FK_league_standing_league"`);
        await queryRunner.query(`ALTER TABLE "match" DROP CONSTRAINT "FK_match_away_team"`);
        await queryRunner.query(`ALTER TABLE "match" DROP CONSTRAINT "FK_match_home_team"`);
        await queryRunner.query(`ALTER TABLE "player_transaction" DROP CONSTRAINT "FK_player_transaction_auction"`);
        await queryRunner.query(`ALTER TABLE "player_transaction" DROP CONSTRAINT "FK_player_transaction_to_team"`);
        await queryRunner.query(`ALTER TABLE "player_transaction" DROP CONSTRAINT "FK_player_transaction_from_team"`);
        await queryRunner.query(`ALTER TABLE "player_transaction" DROP CONSTRAINT "FK_player_transaction_player"`);
        await queryRunner.query(`ALTER TABLE "player_history" DROP CONSTRAINT "FK_player_history_player"`);
        await queryRunner.query(`ALTER TABLE "auction" DROP CONSTRAINT "FK_auction_current_bidder"`);
        await queryRunner.query(`ALTER TABLE "auction" DROP CONSTRAINT "FK_auction_team"`);
        await queryRunner.query(`ALTER TABLE "auction" DROP CONSTRAINT "FK_auction_player"`);
        await queryRunner.query(`ALTER TABLE "transaction" DROP CONSTRAINT "FK_transaction_team"`);
        await queryRunner.query(`ALTER TABLE "finance" DROP CONSTRAINT "FK_finance_team"`);
        await queryRunner.query(`ALTER TABLE "player" DROP CONSTRAINT "FK_player_team"`);
        await queryRunner.query(`ALTER TABLE "team" DROP CONSTRAINT "FK_team_league"`);
        await queryRunner.query(`ALTER TABLE "team" DROP CONSTRAINT "FK_team_user"`);
        await queryRunner.query(`ALTER TABLE "session" DROP CONSTRAINT "FK_session_user"`);

        // Drop tables
        await queryRunner.query(`DROP TABLE "season_result"`);
        await queryRunner.query(`DROP TABLE "league_standing"`);
        await queryRunner.query(`DROP TABLE "match"`);
        await queryRunner.query(`DROP TABLE "player_transaction"`);
        await queryRunner.query(`DROP TABLE "player_history"`);
        await queryRunner.query(`DROP TABLE "auction"`);
        await queryRunner.query(`DROP TABLE "transaction"`);
        await queryRunner.query(`DROP TABLE "finance"`);
        await queryRunner.query(`DROP TABLE "player"`);
        await queryRunner.query(`DROP TABLE "team"`);
        await queryRunner.query(`DROP TABLE "league"`);
        await queryRunner.query(`DROP TABLE "session"`);
        await queryRunner.query(`DROP TABLE "user"`);
    }
}
