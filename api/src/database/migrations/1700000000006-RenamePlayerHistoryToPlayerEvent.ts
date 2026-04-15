import { MigrationInterface, QueryRunner } from 'typeorm';

export class RenamePlayerHistoryToPlayerEvent1700000000006 implements MigrationInterface {
  name = 'RenamePlayerHistoryToPlayerEvent1700000000006';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Step 1: Create new player_event table with new schema
    await queryRunner.query(`
            CREATE TABLE "player_event" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "player_id" uuid NOT NULL,
                "season" integer NOT NULL,
                "date" TIMESTAMPTZ NOT NULL,
                "event_type" VARCHAR(50) NOT NULL,
                "icon" VARCHAR(100),
                "title_key" VARCHAR(255),
                "match_id" uuid,
                "title_data" JSONB,
                "details" JSONB,
                "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
                CONSTRAINT "PK_player_event_id" PRIMARY KEY ("id")
            )
        `);

    // Create indexes
    await queryRunner.query(
      `CREATE INDEX "IDX_player_event_player_id" ON "player_event" ("player_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_player_event_season" ON "player_event" ("season")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_player_event_event_type" ON "player_event" ("event_type")`,
    );

    // Step 2: Create enum type for new event types
    await queryRunner.query(`
            DO $$ BEGIN
                CREATE TYPE "public"."player_event_eventtype_enum" AS ENUM(
                    'TRANSFER',
                    'CONTRACT_RENEWAL',
                    'YOUTH_PROMOTION',
                    'DEBUT',
                    'LEAGUE_DEBUT',
                    'CAPTAIN_DEBUT',
                    'HAT_TRICK',
                    'MAN_OF_THE_MATCH',
                    'GOLDEN_BOOT',
                    'ASSISTS_LEADER',
                    'TACKLES_LEADER',
                    'CHAMPIONSHIP_TITLE',
                    'INJURY',
                    'RECORD_BROKEN'
                );
            EXCEPTION
                WHEN duplicate_object THEN null;
            END $$;
        `);

    // Add enum constraint to event_type column
    await queryRunner.query(`
            ALTER TABLE "player_event"
            ALTER COLUMN "event_type" TYPE VARCHAR(50),
            ALTER COLUMN "event_type" SET NOT NULL
        `);

    // Step 3: Copy existing data from player_history to player_event
    // Map old enum values to new enum values (most are same, just rename)
    await queryRunner.query(`
            INSERT INTO "player_event" ("id", "player_id", "season", "date", "event_type", "details", "created_at", "updated_at")
            SELECT "id", "player_id", "season", "date", "event_type", "details", "created_at", "updated_at"
            FROM "player_history"
        `);

    // Step 4: Drop the old table
    await queryRunner.query(`DROP TABLE "player_history"`);

    // Step 5: Add FK constraints
    await queryRunner.query(`
            ALTER TABLE "player_event"
            ADD CONSTRAINT "FK_player_event_player_id"
            FOREIGN KEY ("player_id") REFERENCES "player"("id") ON DELETE CASCADE
        `);

    await queryRunner.query(`
            ALTER TABLE "player_event"
            ADD CONSTRAINT "FK_player_event_match_id"
            FOREIGN KEY ("match_id") REFERENCES "match"("id") ON DELETE SET NULL
        `);

    // Step 6: Drop old enum type
    await queryRunner.query(
      `DROP TYPE IF EXISTS "public"."player_history_eventtype_enum"`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Recreate old enum type
    await queryRunner.query(`
            CREATE TYPE "public"."player_history_eventtype_enum" AS ENUM(
                'TRANSFER',
                'CONTRACT_RENEWAL',
                'AWARD',
                'INJURY',
                'DEBUT'
            )
        `);

    // Create old table structure
    await queryRunner.query(`
            CREATE TABLE "player_history" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "player_id" uuid NOT NULL,
                "season" integer NOT NULL,
                "date" TIMESTAMPTZ NOT NULL,
                "eventType" "public"."player_history_eventtype_enum" NOT NULL,
                "details" jsonb,
                "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
                CONSTRAINT "PK_player_history_id" PRIMARY KEY ("id")
            )
        `);

    // Copy data back
    await queryRunner.query(`
            INSERT INTO "player_history" ("id", "player_id", "season", "date", "eventType", "details", "created_at", "updated_at")
            SELECT "id", "player_id", "season", "date", "event_type"::"public"."player_history_eventtype_enum", "details", "created_at", "updated_at"
            FROM "player_event"
            WHERE "event_type" IN ('TRANSFER', 'CONTRACT_RENEWAL', 'AWARD', 'INJURY', 'DEBUT')
        `);

    // Drop new table
    await queryRunner.query(`DROP TABLE "player_event"`);
    await queryRunner.query(
      `DROP TYPE IF EXISTS "public"."player_event_eventtype_enum"`,
    );
  }
}
