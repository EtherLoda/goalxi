import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPlayerPotentialSystem1764604874470 implements MigrationInterface {
  name = 'AddPlayerPotentialSystem1764604874470';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            ALTER TABLE "session" DROP CONSTRAINT "FK_session_user"
        `);
    await queryRunner.query(`
            ALTER TABLE "team" DROP CONSTRAINT "FK_team_user"
        `);
    await queryRunner.query(`
            ALTER TABLE "team" DROP CONSTRAINT "FK_team_league"
        `);
    await queryRunner.query(`
            ALTER TABLE "match" DROP CONSTRAINT "FK_match_home_team"
        `);
    await queryRunner.query(`
            ALTER TABLE "match" DROP CONSTRAINT "FK_match_away_team"
        `);
    await queryRunner.query(`
            ALTER TABLE "season_result" DROP CONSTRAINT "FK_season_result_team"
        `);
    await queryRunner.query(`
            ALTER TABLE "league_standing" DROP CONSTRAINT "FK_league_standing_league"
        `);
    await queryRunner.query(`
            ALTER TABLE "league_standing" DROP CONSTRAINT "FK_league_standing_team"
        `);
    await queryRunner.query(`
            ALTER TABLE "finance" DROP CONSTRAINT "FK_finance_team"
        `);
    await queryRunner.query(`
            ALTER TABLE "player" DROP CONSTRAINT "FK_player_team"
        `);
    await queryRunner.query(`
            ALTER TABLE "transaction" DROP CONSTRAINT "FK_transaction_team"
        `);
    await queryRunner.query(`
            ALTER TABLE "auction" DROP CONSTRAINT "FK_auction_player"
        `);
    await queryRunner.query(`
            ALTER TABLE "auction" DROP CONSTRAINT "FK_auction_team"
        `);
    await queryRunner.query(`
            ALTER TABLE "auction" DROP CONSTRAINT "FK_auction_current_bidder"
        `);
    await queryRunner.query(`
            ALTER TABLE "player_history" DROP CONSTRAINT "FK_player_history_player"
        `);
    await queryRunner.query(`
            ALTER TABLE "player_transaction" DROP CONSTRAINT "FK_player_transaction_player"
        `);
    await queryRunner.query(`
            ALTER TABLE "player_transaction" DROP CONSTRAINT "FK_player_transaction_from_team"
        `);
    await queryRunner.query(`
            ALTER TABLE "player_transaction" DROP CONSTRAINT "FK_player_transaction_to_team"
        `);
    await queryRunner.query(`
            ALTER TABLE "player_transaction" DROP CONSTRAINT "FK_player_transaction_auction"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."IDX_team_league"
        `);
    await queryRunner.query(`
            ALTER TABLE "league_standing" DROP CONSTRAINT "UQ_league_standing_league_team"
        `);
    await queryRunner.query(`
            ALTER TABLE "player_history"
                RENAME COLUMN "event_type" TO "eventType"
        `);
    await queryRunner.query(`
            ALTER TABLE "session" DROP COLUMN "deleted_at"
        `);
    await queryRunner.query(`
            ALTER TABLE "season_result" DROP COLUMN "position"
        `);
    await queryRunner.query(`
            ALTER TABLE "match"
            ADD "season" integer
        `);
    await queryRunner.query(`
            ALTER TABLE "match"
            ADD "league_id" character varying
        `);
    await queryRunner.query(`
            ALTER TABLE "season_result"
            ADD "league_id" uuid NOT NULL
        `);
    await queryRunner.query(`
            ALTER TABLE "season_result"
            ADD "final_position" integer NOT NULL
        `);
    await queryRunner.query(`
            ALTER TABLE "season_result"
            ADD "promoted" boolean NOT NULL DEFAULT false
        `);
    await queryRunner.query(`
            ALTER TABLE "season_result"
            ADD "relegated" boolean NOT NULL DEFAULT false
        `);
    await queryRunner.query(`
            ALTER TABLE "player"
            ADD "age" integer NOT NULL DEFAULT '17'
        `);
    await queryRunner.query(`
            ALTER TABLE "player"
            ADD "potential_ability" integer NOT NULL DEFAULT '50'
        `);
    await queryRunner.query(`
            CREATE TYPE "public"."player_potential_tier_enum" AS ENUM('LOW', 'REGULAR', 'HIGH_PRO', 'ELITE', 'LEGEND')
        `);
    await queryRunner.query(`
            ALTER TABLE "player"
            ADD "potential_tier" "public"."player_potential_tier_enum" NOT NULL DEFAULT 'LOW'
        `);
    await queryRunner.query(`
            CREATE TYPE "public"."player_training_slot_enum" AS ENUM('GENIUS', 'REGULAR', 'NONE')
        `);
    await queryRunner.query(`
            ALTER TABLE "player"
            ADD "training_slot" "public"."player_training_slot_enum" NOT NULL DEFAULT 'REGULAR'
        `);
    await queryRunner.query(`
            ALTER TABLE "transaction"
            ADD "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
        `);
    await queryRunner.query(`
            ALTER TABLE "player_transaction"
            ADD "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
        `);
    await queryRunner.query(`
            ALTER TABLE "player_transaction"
            ADD "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
        `);
    await queryRunner.query(`
            ALTER TABLE "session" DROP COLUMN "hash"
        `);
    await queryRunner.query(`
            ALTER TABLE "session"
            ADD "hash" character varying(255) NOT NULL
        `);
    await queryRunner.query(`
            ALTER TABLE "season_result"
            ALTER COLUMN "points"
            SET DEFAULT '0'
        `);
    await queryRunner.query(`
            ALTER TABLE "season_result"
            ALTER COLUMN "wins"
            SET DEFAULT '0'
        `);
    await queryRunner.query(`
            ALTER TABLE "season_result"
            ALTER COLUMN "draws"
            SET DEFAULT '0'
        `);
    await queryRunner.query(`
            ALTER TABLE "season_result"
            ALTER COLUMN "losses"
            SET DEFAULT '0'
        `);
    await queryRunner.query(`
            ALTER TABLE "season_result"
            ALTER COLUMN "goals_for"
            SET DEFAULT '0'
        `);
    await queryRunner.query(`
            ALTER TABLE "season_result"
            ALTER COLUMN "goals_against"
            SET DEFAULT '0'
        `);
    await queryRunner.query(`
            ALTER TABLE "player" DROP COLUMN "birthday"
        `);
    await queryRunner.query(`
            ALTER TABLE "player"
            ADD "birthday" TIMESTAMP
        `);
    await queryRunner.query(`
            ALTER TABLE "player"
            ALTER COLUMN "appearance"
            SET DEFAULT '{}'
        `);
    await queryRunner.query(`
            ALTER TABLE "transaction" DROP COLUMN "type"
        `);
    await queryRunner.query(`
            CREATE TYPE "public"."transaction_type_enum" AS ENUM(
                'MATCH_INCOME',
                'TRANSFER_IN',
                'TRANSFER_OUT',
                'WAGES',
                'SPONSORSHIP',
                'FACILITY_UPGRADE'
            )
        `);
    await queryRunner.query(`
            ALTER TABLE "transaction"
            ADD "type" "public"."transaction_type_enum" NOT NULL
        `);
    await queryRunner.query(`
            ALTER TABLE "auction" DROP COLUMN "status"
        `);
    await queryRunner.query(`
            CREATE TYPE "public"."auction_status_enum" AS ENUM('ACTIVE', 'SOLD', 'EXPIRED', 'CANCELLED')
        `);
    await queryRunner.query(`
            ALTER TABLE "auction"
            ADD "status" "public"."auction_status_enum" NOT NULL DEFAULT 'ACTIVE'
        `);
    await queryRunner.query(`
            ALTER TABLE "player_history" DROP COLUMN "eventType"
        `);
    await queryRunner.query(`
            CREATE TYPE "public"."player_history_eventtype_enum" AS ENUM(
                'TRANSFER',
                'CONTRACT_RENEWAL',
                'AWARD',
                'INJURY',
                'DEBUT'
            )
        `);
    await queryRunner.query(`
            ALTER TABLE "player_history"
            ADD "eventType" "public"."player_history_eventtype_enum" NOT NULL
        `);
    await queryRunner.query(`
            ALTER TABLE "season_result"
            ADD CONSTRAINT "UQ_b9550bda80c368a5fe0a345a855" UNIQUE ("team_id", "season")
        `);
    await queryRunner.query(`
            ALTER TABLE "league_standing"
            ADD CONSTRAINT "UQ_1f482342bd3a1ecb7585e896eeb" UNIQUE ("league_id", "team_id")
        `);
    await queryRunner.query(`
            ALTER TABLE "session"
            ADD CONSTRAINT "FK_session_user" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "team"
            ADD CONSTRAINT "FK_add64c4bdc53d926d9c0992bccc" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "team"
            ADD CONSTRAINT "FK_61d5f175df34e436f88cb7f2859" FOREIGN KEY ("league_id") REFERENCES "league"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "match"
            ADD CONSTRAINT "FK_0ff90eb8a8a558b9e7d26e5e8b5" FOREIGN KEY ("home_team_id") REFERENCES "team"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "match"
            ADD CONSTRAINT "FK_f6b92d7af929d55558a67fd7bcd" FOREIGN KEY ("away_team_id") REFERENCES "team"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "season_result"
            ADD CONSTRAINT "FK_90d629c1e4a4960584f6079a9c3" FOREIGN KEY ("team_id") REFERENCES "team"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "season_result"
            ADD CONSTRAINT "FK_12e4008b7733ffc8a7a298a0172" FOREIGN KEY ("league_id") REFERENCES "league"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "league_standing"
            ADD CONSTRAINT "FK_2e7dfaa760c36a7f4db7c02c74b" FOREIGN KEY ("league_id") REFERENCES "league"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "league_standing"
            ADD CONSTRAINT "FK_28724bfc80791038e4aec16f304" FOREIGN KEY ("team_id") REFERENCES "team"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "finance"
            ADD CONSTRAINT "FK_76cf79cc11b1240125136c70c0d" FOREIGN KEY ("team_id") REFERENCES "team"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "player"
            ADD CONSTRAINT "FK_9deb77a11ad43ce17975f13dc85" FOREIGN KEY ("team_id") REFERENCES "team"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "transaction"
            ADD CONSTRAINT "FK_319e5ba7b0e0d669a6e3f993a81" FOREIGN KEY ("team_id") REFERENCES "team"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "auction"
            ADD CONSTRAINT "FK_c6f3246b7ac7bd4de47b610486b" FOREIGN KEY ("player_id") REFERENCES "player"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "auction"
            ADD CONSTRAINT "FK_89f4cb36e83689add5122994866" FOREIGN KEY ("team_id") REFERENCES "team"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "auction"
            ADD CONSTRAINT "FK_a6e710e1c634362697f45397cc4" FOREIGN KEY ("current_bidder_id") REFERENCES "team"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "player_history"
            ADD CONSTRAINT "FK_febf6eb41877393f6a44c45b0d3" FOREIGN KEY ("player_id") REFERENCES "player"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "player_transaction"
            ADD CONSTRAINT "FK_7aa09c3efe5271f9b5cbac88f42" FOREIGN KEY ("player_id") REFERENCES "player"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "player_transaction"
            ADD CONSTRAINT "FK_208904b782b1b7f91ab6b7b8e39" FOREIGN KEY ("from_team_id") REFERENCES "team"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "player_transaction"
            ADD CONSTRAINT "FK_e19ce30822541272c138a6d7456" FOREIGN KEY ("to_team_id") REFERENCES "team"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "player_transaction"
            ADD CONSTRAINT "FK_45e941155f5a8b50d464f448546" FOREIGN KEY ("auction_id") REFERENCES "auction"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
        `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            ALTER TABLE "player_transaction" DROP CONSTRAINT "FK_45e941155f5a8b50d464f448546"
        `);
    await queryRunner.query(`
            ALTER TABLE "player_transaction" DROP CONSTRAINT "FK_e19ce30822541272c138a6d7456"
        `);
    await queryRunner.query(`
            ALTER TABLE "player_transaction" DROP CONSTRAINT "FK_208904b782b1b7f91ab6b7b8e39"
        `);
    await queryRunner.query(`
            ALTER TABLE "player_transaction" DROP CONSTRAINT "FK_7aa09c3efe5271f9b5cbac88f42"
        `);
    await queryRunner.query(`
            ALTER TABLE "player_history" DROP CONSTRAINT "FK_febf6eb41877393f6a44c45b0d3"
        `);
    await queryRunner.query(`
            ALTER TABLE "auction" DROP CONSTRAINT "FK_a6e710e1c634362697f45397cc4"
        `);
    await queryRunner.query(`
            ALTER TABLE "auction" DROP CONSTRAINT "FK_89f4cb36e83689add5122994866"
        `);
    await queryRunner.query(`
            ALTER TABLE "auction" DROP CONSTRAINT "FK_c6f3246b7ac7bd4de47b610486b"
        `);
    await queryRunner.query(`
            ALTER TABLE "transaction" DROP CONSTRAINT "FK_319e5ba7b0e0d669a6e3f993a81"
        `);
    await queryRunner.query(`
            ALTER TABLE "player" DROP CONSTRAINT "FK_9deb77a11ad43ce17975f13dc85"
        `);
    await queryRunner.query(`
            ALTER TABLE "finance" DROP CONSTRAINT "FK_76cf79cc11b1240125136c70c0d"
        `);
    await queryRunner.query(`
            ALTER TABLE "league_standing" DROP CONSTRAINT "FK_28724bfc80791038e4aec16f304"
        `);
    await queryRunner.query(`
            ALTER TABLE "league_standing" DROP CONSTRAINT "FK_2e7dfaa760c36a7f4db7c02c74b"
        `);
    await queryRunner.query(`
            ALTER TABLE "season_result" DROP CONSTRAINT "FK_12e4008b7733ffc8a7a298a0172"
        `);
    await queryRunner.query(`
            ALTER TABLE "season_result" DROP CONSTRAINT "FK_90d629c1e4a4960584f6079a9c3"
        `);
    await queryRunner.query(`
            ALTER TABLE "match" DROP CONSTRAINT "FK_f6b92d7af929d55558a67fd7bcd"
        `);
    await queryRunner.query(`
            ALTER TABLE "match" DROP CONSTRAINT "FK_0ff90eb8a8a558b9e7d26e5e8b5"
        `);
    await queryRunner.query(`
            ALTER TABLE "team" DROP CONSTRAINT "FK_61d5f175df34e436f88cb7f2859"
        `);
    await queryRunner.query(`
            ALTER TABLE "team" DROP CONSTRAINT "FK_add64c4bdc53d926d9c0992bccc"
        `);
    await queryRunner.query(`
            ALTER TABLE "session" DROP CONSTRAINT "FK_session_user"
        `);
    await queryRunner.query(`
            ALTER TABLE "league_standing" DROP CONSTRAINT "UQ_1f482342bd3a1ecb7585e896eeb"
        `);
    await queryRunner.query(`
            ALTER TABLE "season_result" DROP CONSTRAINT "UQ_b9550bda80c368a5fe0a345a855"
        `);
    await queryRunner.query(`
            ALTER TABLE "player_history" DROP COLUMN "eventType"
        `);
    await queryRunner.query(`
            DROP TYPE "public"."player_history_eventtype_enum"
        `);
    await queryRunner.query(`
            ALTER TABLE "player_history"
            ADD "eventType" character varying NOT NULL
        `);
    await queryRunner.query(`
            ALTER TABLE "auction" DROP COLUMN "status"
        `);
    await queryRunner.query(`
            DROP TYPE "public"."auction_status_enum"
        `);
    await queryRunner.query(`
            ALTER TABLE "auction"
            ADD "status" character varying NOT NULL DEFAULT 'ACTIVE'
        `);
    await queryRunner.query(`
            ALTER TABLE "transaction" DROP COLUMN "type"
        `);
    await queryRunner.query(`
            DROP TYPE "public"."transaction_type_enum"
        `);
    await queryRunner.query(`
            ALTER TABLE "transaction"
            ADD "type" character varying NOT NULL
        `);
    await queryRunner.query(`
            ALTER TABLE "player"
            ALTER COLUMN "appearance" DROP DEFAULT
        `);
    await queryRunner.query(`
            ALTER TABLE "player" DROP COLUMN "birthday"
        `);
    await queryRunner.query(`
            ALTER TABLE "player"
            ADD "birthday" date
        `);
    await queryRunner.query(`
            ALTER TABLE "season_result"
            ALTER COLUMN "goals_against" DROP DEFAULT
        `);
    await queryRunner.query(`
            ALTER TABLE "season_result"
            ALTER COLUMN "goals_for" DROP DEFAULT
        `);
    await queryRunner.query(`
            ALTER TABLE "season_result"
            ALTER COLUMN "losses" DROP DEFAULT
        `);
    await queryRunner.query(`
            ALTER TABLE "season_result"
            ALTER COLUMN "draws" DROP DEFAULT
        `);
    await queryRunner.query(`
            ALTER TABLE "season_result"
            ALTER COLUMN "wins" DROP DEFAULT
        `);
    await queryRunner.query(`
            ALTER TABLE "season_result"
            ALTER COLUMN "points" DROP DEFAULT
        `);
    await queryRunner.query(`
            ALTER TABLE "session" DROP COLUMN "hash"
        `);
    await queryRunner.query(`
            ALTER TABLE "session"
            ADD "hash" character varying NOT NULL
        `);
    await queryRunner.query(`
            ALTER TABLE "player_transaction" DROP COLUMN "updated_at"
        `);
    await queryRunner.query(`
            ALTER TABLE "player_transaction" DROP COLUMN "created_at"
        `);
    await queryRunner.query(`
            ALTER TABLE "transaction" DROP COLUMN "updated_at"
        `);
    await queryRunner.query(`
            ALTER TABLE "player" DROP COLUMN "training_slot"
        `);
    await queryRunner.query(`
            DROP TYPE "public"."player_training_slot_enum"
        `);
    await queryRunner.query(`
            ALTER TABLE "player" DROP COLUMN "potential_tier"
        `);
    await queryRunner.query(`
            DROP TYPE "public"."player_potential_tier_enum"
        `);
    await queryRunner.query(`
            ALTER TABLE "player" DROP COLUMN "potential_ability"
        `);
    await queryRunner.query(`
            ALTER TABLE "player" DROP COLUMN "age"
        `);
    await queryRunner.query(`
            ALTER TABLE "season_result" DROP COLUMN "relegated"
        `);
    await queryRunner.query(`
            ALTER TABLE "season_result" DROP COLUMN "promoted"
        `);
    await queryRunner.query(`
            ALTER TABLE "season_result" DROP COLUMN "final_position"
        `);
    await queryRunner.query(`
            ALTER TABLE "season_result" DROP COLUMN "league_id"
        `);
    await queryRunner.query(`
            ALTER TABLE "match" DROP COLUMN "league_id"
        `);
    await queryRunner.query(`
            ALTER TABLE "match" DROP COLUMN "season"
        `);
    await queryRunner.query(`
            ALTER TABLE "season_result"
            ADD "position" integer NOT NULL
        `);
    await queryRunner.query(`
            ALTER TABLE "session"
            ADD "deleted_at" TIMESTAMP WITH TIME ZONE
        `);
    await queryRunner.query(`
            ALTER TABLE "player_history"
                RENAME COLUMN "eventType" TO "event_type"
        `);
    await queryRunner.query(`
            ALTER TABLE "league_standing"
            ADD CONSTRAINT "UQ_league_standing_league_team" UNIQUE ("league_id", "team_id")
        `);
    await queryRunner.query(`
            CREATE INDEX "IDX_team_league" ON "team" ("league_id")
        `);
    await queryRunner.query(`
            ALTER TABLE "player_transaction"
            ADD CONSTRAINT "FK_player_transaction_auction" FOREIGN KEY ("auction_id") REFERENCES "auction"("id") ON DELETE
            SET NULL ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "player_transaction"
            ADD CONSTRAINT "FK_player_transaction_to_team" FOREIGN KEY ("to_team_id") REFERENCES "team"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "player_transaction"
            ADD CONSTRAINT "FK_player_transaction_from_team" FOREIGN KEY ("from_team_id") REFERENCES "team"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "player_transaction"
            ADD CONSTRAINT "FK_player_transaction_player" FOREIGN KEY ("player_id") REFERENCES "player"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "player_history"
            ADD CONSTRAINT "FK_player_history_player" FOREIGN KEY ("player_id") REFERENCES "player"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "auction"
            ADD CONSTRAINT "FK_auction_current_bidder" FOREIGN KEY ("current_bidder_id") REFERENCES "team"("id") ON DELETE
            SET NULL ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "auction"
            ADD CONSTRAINT "FK_auction_team" FOREIGN KEY ("team_id") REFERENCES "team"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "auction"
            ADD CONSTRAINT "FK_auction_player" FOREIGN KEY ("player_id") REFERENCES "player"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "transaction"
            ADD CONSTRAINT "FK_transaction_team" FOREIGN KEY ("team_id") REFERENCES "team"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "player"
            ADD CONSTRAINT "FK_player_team" FOREIGN KEY ("team_id") REFERENCES "team"("id") ON DELETE
            SET NULL ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "finance"
            ADD CONSTRAINT "FK_finance_team" FOREIGN KEY ("team_id") REFERENCES "team"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "league_standing"
            ADD CONSTRAINT "FK_league_standing_team" FOREIGN KEY ("team_id") REFERENCES "team"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "league_standing"
            ADD CONSTRAINT "FK_league_standing_league" FOREIGN KEY ("league_id") REFERENCES "league"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "season_result"
            ADD CONSTRAINT "FK_season_result_team" FOREIGN KEY ("team_id") REFERENCES "team"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "match"
            ADD CONSTRAINT "FK_match_away_team" FOREIGN KEY ("away_team_id") REFERENCES "team"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "match"
            ADD CONSTRAINT "FK_match_home_team" FOREIGN KEY ("home_team_id") REFERENCES "team"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "team"
            ADD CONSTRAINT "FK_team_league" FOREIGN KEY ("league_id") REFERENCES "league"("id") ON DELETE
            SET NULL ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "team"
            ADD CONSTRAINT "FK_team_user" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "session"
            ADD CONSTRAINT "FK_session_user" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
  }
}
