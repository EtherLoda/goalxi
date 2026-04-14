import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialSchema1700000000001 implements MigrationInterface {
  name = 'InitialSchema1700000000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            CREATE TABLE "session" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "hash" character varying(255) NOT NULL,
                "user_id" uuid NOT NULL,
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                CONSTRAINT "PK_session_id" PRIMARY KEY ("id")
            )
        `);
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
                "deleted_at" TIMESTAMP WITH TIME ZONE,
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                CONSTRAINT "PK_user_id" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE UNIQUE INDEX "UQ_user_username" ON "user" ("username")
            WHERE "deleted_at" IS NULL
        `);
    await queryRunner.query(`
            CREATE UNIQUE INDEX "UQ_user_email" ON "user" ("email")
            WHERE "deleted_at" IS NULL
        `);
    await queryRunner.query(`
            CREATE TABLE "league" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "name" character varying NOT NULL,
                "tier" integer NOT NULL DEFAULT '1',
                "tierDivision" integer NOT NULL DEFAULT '1',
                "maxTeams" integer NOT NULL DEFAULT '16',
                "promotion_slots" integer NOT NULL DEFAULT '1',
                "playoff_slots" integer NOT NULL DEFAULT '4',
                "relegation_slots" integer NOT NULL DEFAULT '4',
                "status" character varying NOT NULL DEFAULT 'active',
                "parent_league_id" uuid,
                "deleted_at" TIMESTAMP WITH TIME ZONE,
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                CONSTRAINT "PK_league_id" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE TABLE "team" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "user_id" uuid NOT NULL,
                "league_id" uuid,
                "name" character varying NOT NULL,
                "nationality" character varying(2),
                "logo_url" character varying NOT NULL DEFAULT '',
                "jersey_color_primary" character varying NOT NULL DEFAULT '#FF0000',
                "jersey_color_secondary" character varying NOT NULL DEFAULT '#FFFFFF',
                "bench_config" jsonb,
                "is_bot" boolean NOT NULL DEFAULT true,
                "bot_level" integer NOT NULL DEFAULT '5',
                "training_physical_intensity" double precision NOT NULL DEFAULT '0.1',
                "elo_rating" integer NOT NULL DEFAULT '1500',
                "deleted_at" TIMESTAMP WITH TIME ZONE,
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                CONSTRAINT "PK_team_id" PRIMARY KEY ("id")
            );
            COMMENT ON COLUMN "team"."nationality" IS 'ISO 3166-1 alpha-2 country code (e.g., CN, US, GB, DE)';
            COMMENT ON COLUMN "team"."bench_config" IS 'Bench configuration for substitutions'
        `);
    await queryRunner.query(`
            CREATE TABLE "match" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "league_id" uuid NOT NULL,
                "season" integer NOT NULL,
                "week" integer NOT NULL,
                "home_team_id" uuid NOT NULL,
                "away_team_id" uuid NOT NULL,
                "scheduled_at" TIMESTAMP NOT NULL,
                "status" character varying(20) NOT NULL DEFAULT 'scheduled',
                "type" character varying(30) NOT NULL DEFAULT 'league',
                "home_score" integer,
                "away_score" integer,
                "simulation_completed_at" TIMESTAMP,
                "tactics_locked_at" TIMESTAMP,
                "actual_end_time" TIMESTAMP,
                "tactics_locked" boolean NOT NULL DEFAULT false,
                "home_forfeit" boolean NOT NULL DEFAULT false,
                "away_forfeit" boolean NOT NULL DEFAULT false,
                "started_at" TIMESTAMP,
                "completed_at" TIMESTAMP,
                "first_half_injury_time" integer,
                "second_half_injury_time" integer,
                "has_extra_time" boolean NOT NULL DEFAULT false,
                "requires_winner" boolean NOT NULL DEFAULT false,
                "extra_time_first_half_injury" integer,
                "extra_time_second_half_injury" integer,
                "has_penalty_shootout" boolean NOT NULL DEFAULT false,
                "lower_league_id" uuid,
                "weather" character varying(20),
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                CONSTRAINT "PK_92b6c3a6631dd5b24a67c69f69d" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE INDEX "IDX_f6b92d7af929d55558a67fd7bc" ON "match" ("away_team_id")
        `);
    await queryRunner.query(`
            CREATE INDEX "IDX_0ff90eb8a8a558b9e7d26e5e8b" ON "match" ("home_team_id")
        `);
    await queryRunner.query(`
            CREATE INDEX "IDX_56c1948265cd25148fcf5d88d1" ON "match" ("league_id", "season", "week")
        `);
    await queryRunner.query(`
            CREATE TABLE "tactics_preset" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "team_id" uuid NOT NULL,
                "name" character varying(100) NOT NULL,
                "is_default" boolean NOT NULL DEFAULT false,
                "formation" character varying(10) NOT NULL,
                "lineup" jsonb NOT NULL,
                "instructions" jsonb,
                "substitutions" jsonb,
                "created_at" TIMESTAMP NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "PK_b96bbb5399dbca91d03749d2091" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE INDEX "IDX_4c3e8cb3e9049cc191f30bbf4a" ON "tactics_preset" ("team_id", "is_default")
        `);
    await queryRunner.query(`
            CREATE TABLE "match_tactics" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "match_id" uuid NOT NULL,
                "team_id" uuid NOT NULL,
                "preset_id" uuid,
                "formation" character varying(10) NOT NULL,
                "lineup" jsonb NOT NULL,
                "instructions" jsonb,
                "substitutions" jsonb,
                "submitted_at" TIMESTAMP NOT NULL,
                "created_at" TIMESTAMP NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "PK_7fb22803515baa1e2d04f1a4af0" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE TYPE "public"."player_potential_tier_enum" AS ENUM('LOW', 'REGULAR', 'HIGH_PRO', 'ELITE', 'LEGEND')
        `);
    await queryRunner.query(`
            CREATE TYPE "public"."player_training_slot_enum" AS ENUM('ENHANCED', 'REGULAR', 'NONE')
        `);
    await queryRunner.query(`
            CREATE TYPE "public"."player_training_category_enum" AS ENUM(
                'physical',
                'technical',
                'mental',
                'setPieces',
                'goalkeeper'
            )
        `);
    await queryRunner.query(`
            CREATE TABLE "player" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "team_id" uuid,
                "name" character varying NOT NULL,
                "nationality" character varying(2),
                "birthday" date,
                "is_youth" boolean NOT NULL DEFAULT false,
                "appearance" jsonb NOT NULL DEFAULT '{}',
                "is_goalkeeper" boolean NOT NULL DEFAULT false,
                "on_transfer" boolean NOT NULL DEFAULT false,
                "current_skills" jsonb NOT NULL,
                "potential_skills" jsonb NOT NULL,
                "potential_ability" integer NOT NULL DEFAULT '50',
                "potential_tier" "public"."player_potential_tier_enum" NOT NULL DEFAULT 'LOW',
                "training_slot" "public"."player_training_slot_enum" NOT NULL DEFAULT 'REGULAR',
                "training_category" "public"."player_training_category_enum" NOT NULL DEFAULT 'physical',
                "training_skill" character varying(20),
                "experience" double precision NOT NULL DEFAULT '0',
                "form" double precision NOT NULL DEFAULT '3',
                "match_minutes" integer NOT NULL DEFAULT '0',
                "stamina" double precision NOT NULL DEFAULT '3',
                "current_wage" integer NOT NULL DEFAULT '2000',
                "career_stats" jsonb NOT NULL DEFAULT '{}',
                "deleted_at" TIMESTAMP WITH TIME ZONE,
                "current_injury_value" integer NOT NULL DEFAULT '0',
                "injury_type" character varying(20),
                "injury_state" character varying(10),
                "injured_at" TIMESTAMP WITH TIME ZONE,
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                CONSTRAINT "PK_player_id" PRIMARY KEY ("id")
            );
            COMMENT ON COLUMN "player"."nationality" IS 'ISO 3166-1 alpha-2 country code (e.g., CN, US, GB, DE)'
        `);
    await queryRunner.query(`
            CREATE TABLE "match_event" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "match_id" uuid NOT NULL,
                "minute" integer NOT NULL,
                "second" integer NOT NULL DEFAULT '0',
                "type" integer NOT NULL,
                "type_name" character varying(100) NOT NULL,
                "team_id" uuid,
                "player_id" uuid,
                "related_player_id" uuid,
                "phase" character varying(16) NOT NULL DEFAULT 'FIRST_HALF',
                "lane" character varying(8),
                "isHome" boolean,
                "data" jsonb,
                "shotType" character varying(32),
                "bodyPart" character varying(16),
                "cardType" character varying(16),
                "injurySeverity" character varying(16),
                "subPosition" character varying(16),
                "penaltyOutcome" character varying(16),
                "event_scheduled_time" TIMESTAMP,
                "is_revealed" boolean NOT NULL DEFAULT false,
                "created_at" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "PK_c1329cb9d3397d63a39a11f6af5" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE INDEX "IDX_bc4439e7d249e39c5f72944759" ON "match_event" ("player_id", "type")
        `);
    await queryRunner.query(`
            CREATE INDEX "IDX_c47a98eeac3a22c7b301938e44" ON "match_event" ("match_id", "event_scheduled_time")
        `);
    await queryRunner.query(`
            CREATE INDEX "IDX_fd5c4b0a7322bc10169808d9b0" ON "match_event" ("match_id", "phase", "minute")
        `);
    await queryRunner.query(`
            CREATE TABLE "match_team_stats" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "match_id" uuid NOT NULL,
                "team_id" uuid NOT NULL,
                "possession_percentage" numeric(5, 2),
                "shots" integer NOT NULL DEFAULT '0',
                "shots_on_target" integer NOT NULL DEFAULT '0',
                "corners" integer NOT NULL DEFAULT '0',
                "free_kicks" integer NOT NULL DEFAULT '0',
                "free_kick_goals" integer NOT NULL DEFAULT '0',
                "indirect_free_kicks" integer NOT NULL DEFAULT '0',
                "indirect_free_kick_goals" integer NOT NULL DEFAULT '0',
                "penalties" integer NOT NULL DEFAULT '0',
                "penalty_goals" integer NOT NULL DEFAULT '0',
                "fouls" integer NOT NULL DEFAULT '0',
                "offsides" integer NOT NULL DEFAULT '0',
                "yellow_cards" integer NOT NULL DEFAULT '0',
                "red_cards" integer NOT NULL DEFAULT '0',
                "passes_completed" integer NOT NULL DEFAULT '0',
                "passes_attempted" integer NOT NULL DEFAULT '0',
                "lane_strength_averages" jsonb,
                "created_at" TIMESTAMP NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "PK_3f2a6f1a9bb45a895bcb1a1ef22" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE TABLE "season_result" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "team_id" uuid NOT NULL,
                "league_id" uuid NOT NULL,
                "season" integer NOT NULL,
                "final_position" integer NOT NULL,
                "points" integer NOT NULL DEFAULT '0',
                "wins" integer NOT NULL DEFAULT '0',
                "draws" integer NOT NULL DEFAULT '0',
                "losses" integer NOT NULL DEFAULT '0',
                "goals_for" integer NOT NULL DEFAULT '0',
                "goals_against" integer NOT NULL DEFAULT '0',
                "promoted" boolean NOT NULL DEFAULT false,
                "relegated" boolean NOT NULL DEFAULT false,
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                CONSTRAINT "UQ_b9550bda80c368a5fe0a345a855" UNIQUE ("team_id", "season"),
                CONSTRAINT "PK_98a28a6d558991bb69e3134481d" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE TABLE "league_standing" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "league_id" uuid NOT NULL,
                "team_id" uuid NOT NULL,
                "season" integer NOT NULL DEFAULT '1',
                "position" integer NOT NULL DEFAULT '0',
                "played" integer NOT NULL DEFAULT '0',
                "points" integer NOT NULL DEFAULT '0',
                "wins" integer NOT NULL DEFAULT '0',
                "draws" integer NOT NULL DEFAULT '0',
                "losses" integer NOT NULL DEFAULT '0',
                "goals_for" integer NOT NULL DEFAULT '0',
                "goals_against" integer NOT NULL DEFAULT '0',
                "goal_difference" integer NOT NULL DEFAULT '0',
                "recent_form" character varying(10) NOT NULL DEFAULT '',
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                CONSTRAINT "UQ_2437d82b91912d5f67006ed8c44" UNIQUE ("league_id", "team_id", "season"),
                CONSTRAINT "PK_3f6f94b33326855335f2afd5b55" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE INDEX "IDX_1b54e2eadd30429ea1a36f1403" ON "league_standing" ("league_id", "season", "position")
        `);
    await queryRunner.query(`
            CREATE TABLE "finance" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "team_id" uuid NOT NULL,
                "balance" integer NOT NULL DEFAULT '100000',
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                CONSTRAINT "REL_76cf79cc11b1240125136c70c0" UNIQUE ("team_id"),
                CONSTRAINT "PK_finance_id" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE TYPE "public"."transaction_type_enum" AS ENUM(
                'TICKET_INCOME',
                'SPONSORSHIP',
                'TRANSFER_IN',
                'PRIZE_MONEY',
                'WAGES',
                'STAFF_WAGES',
                'TRANSFER_OUT',
                'FACILITY_UPGRADE',
                'STADIUM_MAINTENANCE',
                'MEDICAL',
                'YOUTH_TEAM'
            )
        `);
    await queryRunner.query(`
            CREATE TABLE "transaction" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "team_id" uuid NOT NULL,
                "season" integer NOT NULL,
                "amount" integer NOT NULL,
                "type" "public"."transaction_type_enum" NOT NULL,
                "description" character varying,
                "related_id" uuid,
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                CONSTRAINT "PK_transaction_id" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE TYPE "public"."auction_status_enum" AS ENUM('ACTIVE', 'SOLD', 'EXPIRED', 'CANCELLED')
        `);
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
                "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL,
                "ends_at" TIMESTAMP WITH TIME ZONE,
                "bid_history" jsonb NOT NULL DEFAULT '[]',
                "status" "public"."auction_status_enum" NOT NULL DEFAULT 'ACTIVE',
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                CONSTRAINT "PK_auction_id" PRIMARY KEY ("id")
            )
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
            CREATE TABLE "player_history" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "player_id" uuid NOT NULL,
                "season" integer NOT NULL,
                "date" TIMESTAMP WITH TIME ZONE NOT NULL,
                "eventType" "public"."player_history_eventtype_enum" NOT NULL,
                "details" jsonb,
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                CONSTRAINT "PK_player_history_id" PRIMARY KEY ("id")
            )
        `);
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
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                CONSTRAINT "PK_player_transaction_id" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE TABLE "youth_league" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "name" character varying NOT NULL,
                "parent_tier" integer NOT NULL,
                "max_teams" integer NOT NULL DEFAULT '16',
                "status" character varying NOT NULL DEFAULT 'active',
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                CONSTRAINT "PK_1e3f0ee4088c9c478d22d767d78" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE TABLE "youth_team" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "team_id" uuid NOT NULL,
                "youth_league_id" uuid NOT NULL,
                "name" character varying NOT NULL,
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                CONSTRAINT "PK_dc5300d49e5d79449454c502f16" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE TYPE "public"."youth_player_potential_tier_enum" AS ENUM('LOW', 'REGULAR', 'HIGH_PRO', 'ELITE', 'LEGEND')
        `);
    await queryRunner.query(`
            CREATE TABLE "youth_player" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "team_id" uuid NOT NULL,
                "youth_team_id" uuid,
                "name" character varying NOT NULL,
                "nationality" character varying,
                "birthday" date NOT NULL,
                "is_goalkeeper" boolean NOT NULL DEFAULT false,
                "current_skills" jsonb NOT NULL,
                "potential_skills" jsonb NOT NULL,
                "abilities" jsonb,
                "reveal_level" integer NOT NULL DEFAULT '1',
                "revealed_skills" jsonb NOT NULL DEFAULT '[]',
                "potential_revealed" boolean NOT NULL DEFAULT false,
                "potential_tier" "public"."youth_player_potential_tier_enum",
                "is_promoted" boolean NOT NULL DEFAULT false,
                "joined_at" date NOT NULL,
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                CONSTRAINT "PK_youth_player_id" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE TABLE "youth_match" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "youth_league_id" uuid NOT NULL,
                "season" integer NOT NULL,
                "week" integer NOT NULL,
                "home_youth_team_id" uuid NOT NULL,
                "away_youth_team_id" uuid NOT NULL,
                "scheduled_at" TIMESTAMP NOT NULL,
                "status" character varying(20) NOT NULL DEFAULT 'scheduled',
                "home_score" integer,
                "away_score" integer,
                "simulation_completed_at" TIMESTAMP,
                "tactics_locked_at" TIMESTAMP,
                "actual_end_time" TIMESTAMP,
                "tactics_locked" boolean NOT NULL DEFAULT false,
                "home_forfeit" boolean NOT NULL DEFAULT false,
                "away_forfeit" boolean NOT NULL DEFAULT false,
                "started_at" TIMESTAMP,
                "completed_at" TIMESTAMP,
                "first_half_injury_time" integer,
                "second_half_injury_time" integer,
                "has_extra_time" boolean NOT NULL DEFAULT false,
                "requires_winner" boolean NOT NULL DEFAULT false,
                "extra_time_first_half_injury" integer,
                "extra_time_second_half_injury" integer,
                "has_penalty_shootout" boolean NOT NULL DEFAULT false,
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                CONSTRAINT "PK_03cb8a822eb2a1f7c29ed1cf813" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE INDEX "IDX_333f35de79e1f51bdf58476145" ON "youth_match" ("youth_league_id", "season", "week")
        `);
    await queryRunner.query(`
            CREATE TABLE "youth_match_event" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "youth_match_id" uuid NOT NULL,
                "minute" integer NOT NULL,
                "second" integer NOT NULL DEFAULT '0',
                "type" integer NOT NULL,
                "type_name" character varying(100) NOT NULL,
                "team_id" uuid,
                "player_id" uuid,
                "related_player_id" uuid,
                "phase" character varying(16) NOT NULL DEFAULT 'FIRST_HALF',
                "lane" character varying(8),
                "isHome" boolean,
                "data" jsonb,
                "shotType" character varying(32),
                "bodyPart" character varying(16),
                "cardType" character varying(16),
                "injurySeverity" character varying(16),
                "subPosition" character varying(16),
                "penaltyOutcome" character varying(16),
                "event_scheduled_time" TIMESTAMP,
                "is_revealed" boolean NOT NULL DEFAULT false,
                "created_at" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "PK_2c9a50ca2716473b1e6c6bab5b5" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE INDEX "IDX_764512441d3f0eaf4ea68d4bc7" ON "youth_match_event" ("player_id", "type")
        `);
    await queryRunner.query(`
            CREATE INDEX "IDX_a975373beb965879622f88bd77" ON "youth_match_event" ("youth_match_id", "event_scheduled_time")
        `);
    await queryRunner.query(`
            CREATE INDEX "IDX_bbae04a95fec94e5ff8fa466ae" ON "youth_match_event" ("youth_match_id", "phase", "minute")
        `);
    await queryRunner.query(`
            CREATE TABLE "youth_match_tactics" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "youth_match_id" uuid NOT NULL,
                "team_id" uuid NOT NULL,
                "formation" character varying NOT NULL,
                "lineup" jsonb NOT NULL,
                "substitutions" jsonb,
                "instructions" jsonb,
                "created_at" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "PK_5f80fc22fc5229379ae2a11cec1" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE UNIQUE INDEX "IDX_a00968dfabab6709a6fc205174" ON "youth_match_tactics" ("youth_match_id", "team_id")
        `);
    await queryRunner.query(`
            CREATE TYPE "public"."staff_role_enum" AS ENUM(
                'head_coach',
                'fitness_coach',
                'psychology_coach',
                'technical_coach',
                'set_piece_coach',
                'goalkeeper_coach',
                'team_doctor'
            )
        `);
    await queryRunner.query(`
            CREATE TYPE "public"."staff_level_enum" AS ENUM('1', '2', '3', '4', '5')
        `);
    await queryRunner.query(`
            CREATE TABLE "staff" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "team_id" uuid NOT NULL,
                "name" character varying NOT NULL,
                "role" "public"."staff_role_enum" NOT NULL,
                "level" "public"."staff_level_enum" NOT NULL,
                "salary" integer NOT NULL,
                "contract_expiry" TIMESTAMP NOT NULL,
                "auto_renew" boolean NOT NULL DEFAULT true,
                "is_active" boolean NOT NULL DEFAULT true,
                "nationality" character varying,
                "appearance" jsonb,
                "youth_report" text,
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                CONSTRAINT "PK_staff_id" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE TABLE "stadium" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "team_id" uuid NOT NULL,
                "capacity" integer NOT NULL DEFAULT '5000',
                "is_built" boolean NOT NULL DEFAULT true,
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                CONSTRAINT "PK_e1fec3f13003877cd87a990655d" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE TABLE "fan" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "team_id" uuid NOT NULL,
                "total_fans" integer NOT NULL DEFAULT '10000',
                "fan_emotion" integer NOT NULL DEFAULT '50',
                "recent_form" character varying(10) NOT NULL DEFAULT '',
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                CONSTRAINT "PK_747b44cb763192345e64ebd17b1" PRIMARY KEY ("id")
            )
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
            ADD CONSTRAINT "FK_5243e7f168b381cf979cd039ec9" FOREIGN KEY ("league_id") REFERENCES "league"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
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
            ALTER TABLE "tactics_preset"
            ADD CONSTRAINT "FK_0b9598b1b8d26dc1706b0a29a86" FOREIGN KEY ("team_id") REFERENCES "team"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "match_tactics"
            ADD CONSTRAINT "FK_79feeee44a5484c823eb6983758" FOREIGN KEY ("match_id") REFERENCES "match"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "match_tactics"
            ADD CONSTRAINT "FK_a4d9060b72a223641f2cc20a73a" FOREIGN KEY ("team_id") REFERENCES "team"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "match_tactics"
            ADD CONSTRAINT "FK_a3f54cbe60822be9cbd9d2f6fae" FOREIGN KEY ("preset_id") REFERENCES "tactics_preset"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "player"
            ADD CONSTRAINT "FK_9deb77a11ad43ce17975f13dc85" FOREIGN KEY ("team_id") REFERENCES "team"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "match_event"
            ADD CONSTRAINT "FK_9f789e95a157139a4e508a9f35d" FOREIGN KEY ("match_id") REFERENCES "match"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "match_event"
            ADD CONSTRAINT "FK_8a8f47c06aae3a29ace8f375dbc" FOREIGN KEY ("team_id") REFERENCES "team"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "match_event"
            ADD CONSTRAINT "FK_edba289307c9b420a525540d723" FOREIGN KEY ("player_id") REFERENCES "player"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "match_event"
            ADD CONSTRAINT "FK_4be4a6f512dbc9cf1968f9101a9" FOREIGN KEY ("related_player_id") REFERENCES "player"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "match_team_stats"
            ADD CONSTRAINT "FK_12b4fef7f3e5e1b3490524cc26c" FOREIGN KEY ("match_id") REFERENCES "match"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "match_team_stats"
            ADD CONSTRAINT "FK_980a78509a7d4ae5f695e729f9c" FOREIGN KEY ("team_id") REFERENCES "team"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
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
    await queryRunner.query(`
            ALTER TABLE "youth_team"
            ADD CONSTRAINT "FK_e499901f5c5edb46e2cead2a129" FOREIGN KEY ("team_id") REFERENCES "team"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "youth_team"
            ADD CONSTRAINT "FK_c0699aa0c7090c9d98f0bb782a2" FOREIGN KEY ("youth_league_id") REFERENCES "youth_league"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "youth_player"
            ADD CONSTRAINT "FK_a4e73f10c5dacd8f6318e8493fa" FOREIGN KEY ("youth_team_id") REFERENCES "youth_team"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "youth_match"
            ADD CONSTRAINT "FK_a4081968e1da65736db7a3372eb" FOREIGN KEY ("youth_league_id") REFERENCES "youth_league"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "youth_match"
            ADD CONSTRAINT "FK_abb7a3ecf88e28d8ba73b449716" FOREIGN KEY ("home_youth_team_id") REFERENCES "youth_team"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "youth_match"
            ADD CONSTRAINT "FK_419c2e55ee45347cd32f2ae9b2e" FOREIGN KEY ("away_youth_team_id") REFERENCES "youth_team"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "youth_match_event"
            ADD CONSTRAINT "FK_09514a885c07bdf5daf160d91ee" FOREIGN KEY ("youth_match_id") REFERENCES "youth_match"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "youth_match_event"
            ADD CONSTRAINT "FK_a733f96b5c8c095f216474ca8fb" FOREIGN KEY ("team_id") REFERENCES "youth_team"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "youth_match_event"
            ADD CONSTRAINT "FK_eae6924984cd565848469379547" FOREIGN KEY ("player_id") REFERENCES "youth_player"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "youth_match_event"
            ADD CONSTRAINT "FK_c00cde9eb5d6003a616c1f84a9a" FOREIGN KEY ("related_player_id") REFERENCES "youth_player"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "youth_match_tactics"
            ADD CONSTRAINT "FK_88a256d099a9bdc1115cc076cdf" FOREIGN KEY ("youth_match_id") REFERENCES "youth_match"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "youth_match_tactics"
            ADD CONSTRAINT "FK_fd6fcf47e399b1ce937c20a9284" FOREIGN KEY ("team_id") REFERENCES "youth_team"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
        `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            ALTER TABLE "youth_match_tactics" DROP CONSTRAINT "FK_fd6fcf47e399b1ce937c20a9284"
        `);
    await queryRunner.query(`
            ALTER TABLE "youth_match_tactics" DROP CONSTRAINT "FK_88a256d099a9bdc1115cc076cdf"
        `);
    await queryRunner.query(`
            ALTER TABLE "youth_match_event" DROP CONSTRAINT "FK_c00cde9eb5d6003a616c1f84a9a"
        `);
    await queryRunner.query(`
            ALTER TABLE "youth_match_event" DROP CONSTRAINT "FK_eae6924984cd565848469379547"
        `);
    await queryRunner.query(`
            ALTER TABLE "youth_match_event" DROP CONSTRAINT "FK_a733f96b5c8c095f216474ca8fb"
        `);
    await queryRunner.query(`
            ALTER TABLE "youth_match_event" DROP CONSTRAINT "FK_09514a885c07bdf5daf160d91ee"
        `);
    await queryRunner.query(`
            ALTER TABLE "youth_match" DROP CONSTRAINT "FK_419c2e55ee45347cd32f2ae9b2e"
        `);
    await queryRunner.query(`
            ALTER TABLE "youth_match" DROP CONSTRAINT "FK_abb7a3ecf88e28d8ba73b449716"
        `);
    await queryRunner.query(`
            ALTER TABLE "youth_match" DROP CONSTRAINT "FK_a4081968e1da65736db7a3372eb"
        `);
    await queryRunner.query(`
            ALTER TABLE "youth_player" DROP CONSTRAINT "FK_a4e73f10c5dacd8f6318e8493fa"
        `);
    await queryRunner.query(`
            ALTER TABLE "youth_team" DROP CONSTRAINT "FK_c0699aa0c7090c9d98f0bb782a2"
        `);
    await queryRunner.query(`
            ALTER TABLE "youth_team" DROP CONSTRAINT "FK_e499901f5c5edb46e2cead2a129"
        `);
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
            ALTER TABLE "match_team_stats" DROP CONSTRAINT "FK_980a78509a7d4ae5f695e729f9c"
        `);
    await queryRunner.query(`
            ALTER TABLE "match_team_stats" DROP CONSTRAINT "FK_12b4fef7f3e5e1b3490524cc26c"
        `);
    await queryRunner.query(`
            ALTER TABLE "match_event" DROP CONSTRAINT "FK_4be4a6f512dbc9cf1968f9101a9"
        `);
    await queryRunner.query(`
            ALTER TABLE "match_event" DROP CONSTRAINT "FK_edba289307c9b420a525540d723"
        `);
    await queryRunner.query(`
            ALTER TABLE "match_event" DROP CONSTRAINT "FK_8a8f47c06aae3a29ace8f375dbc"
        `);
    await queryRunner.query(`
            ALTER TABLE "match_event" DROP CONSTRAINT "FK_9f789e95a157139a4e508a9f35d"
        `);
    await queryRunner.query(`
            ALTER TABLE "player" DROP CONSTRAINT "FK_9deb77a11ad43ce17975f13dc85"
        `);
    await queryRunner.query(`
            ALTER TABLE "match_tactics" DROP CONSTRAINT "FK_a3f54cbe60822be9cbd9d2f6fae"
        `);
    await queryRunner.query(`
            ALTER TABLE "match_tactics" DROP CONSTRAINT "FK_a4d9060b72a223641f2cc20a73a"
        `);
    await queryRunner.query(`
            ALTER TABLE "match_tactics" DROP CONSTRAINT "FK_79feeee44a5484c823eb6983758"
        `);
    await queryRunner.query(`
            ALTER TABLE "tactics_preset" DROP CONSTRAINT "FK_0b9598b1b8d26dc1706b0a29a86"
        `);
    await queryRunner.query(`
            ALTER TABLE "match" DROP CONSTRAINT "FK_f6b92d7af929d55558a67fd7bcd"
        `);
    await queryRunner.query(`
            ALTER TABLE "match" DROP CONSTRAINT "FK_0ff90eb8a8a558b9e7d26e5e8b5"
        `);
    await queryRunner.query(`
            ALTER TABLE "match" DROP CONSTRAINT "FK_5243e7f168b381cf979cd039ec9"
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
            DROP TABLE "fan"
        `);
    await queryRunner.query(`
            DROP TABLE "stadium"
        `);
    await queryRunner.query(`
            DROP TABLE "staff"
        `);
    await queryRunner.query(`
            DROP TYPE "public"."staff_level_enum"
        `);
    await queryRunner.query(`
            DROP TYPE "public"."staff_role_enum"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."IDX_a00968dfabab6709a6fc205174"
        `);
    await queryRunner.query(`
            DROP TABLE "youth_match_tactics"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."IDX_bbae04a95fec94e5ff8fa466ae"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."IDX_a975373beb965879622f88bd77"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."IDX_764512441d3f0eaf4ea68d4bc7"
        `);
    await queryRunner.query(`
            DROP TABLE "youth_match_event"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."IDX_333f35de79e1f51bdf58476145"
        `);
    await queryRunner.query(`
            DROP TABLE "youth_match"
        `);
    await queryRunner.query(`
            DROP TABLE "youth_player"
        `);
    await queryRunner.query(`
            DROP TYPE "public"."youth_player_potential_tier_enum"
        `);
    await queryRunner.query(`
            DROP TABLE "youth_team"
        `);
    await queryRunner.query(`
            DROP TABLE "youth_league"
        `);
    await queryRunner.query(`
            DROP TABLE "player_transaction"
        `);
    await queryRunner.query(`
            DROP TABLE "player_history"
        `);
    await queryRunner.query(`
            DROP TYPE "public"."player_history_eventtype_enum"
        `);
    await queryRunner.query(`
            DROP TABLE "auction"
        `);
    await queryRunner.query(`
            DROP TYPE "public"."auction_status_enum"
        `);
    await queryRunner.query(`
            DROP TABLE "transaction"
        `);
    await queryRunner.query(`
            DROP TYPE "public"."transaction_type_enum"
        `);
    await queryRunner.query(`
            DROP TABLE "finance"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."IDX_1b54e2eadd30429ea1a36f1403"
        `);
    await queryRunner.query(`
            DROP TABLE "league_standing"
        `);
    await queryRunner.query(`
            DROP TABLE "season_result"
        `);
    await queryRunner.query(`
            DROP TABLE "match_team_stats"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."IDX_fd5c4b0a7322bc10169808d9b0"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."IDX_c47a98eeac3a22c7b301938e44"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."IDX_bc4439e7d249e39c5f72944759"
        `);
    await queryRunner.query(`
            DROP TABLE "match_event"
        `);
    await queryRunner.query(`
            DROP TABLE "player"
        `);
    await queryRunner.query(`
            DROP TYPE "public"."player_training_category_enum"
        `);
    await queryRunner.query(`
            DROP TYPE "public"."player_training_slot_enum"
        `);
    await queryRunner.query(`
            DROP TYPE "public"."player_potential_tier_enum"
        `);
    await queryRunner.query(`
            DROP TABLE "match_tactics"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."IDX_4c3e8cb3e9049cc191f30bbf4a"
        `);
    await queryRunner.query(`
            DROP TABLE "tactics_preset"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."IDX_56c1948265cd25148fcf5d88d1"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."IDX_0ff90eb8a8a558b9e7d26e5e8b"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."IDX_f6b92d7af929d55558a67fd7bc"
        `);
    await queryRunner.query(`
            DROP TABLE "match"
        `);
    await queryRunner.query(`
            DROP TABLE "team"
        `);
    await queryRunner.query(`
            DROP TABLE "league"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."UQ_user_email"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."UQ_user_username"
        `);
    await queryRunner.query(`
            DROP TABLE "user"
        `);
    await queryRunner.query(`
            DROP TABLE "session"
        `);
  }
}
