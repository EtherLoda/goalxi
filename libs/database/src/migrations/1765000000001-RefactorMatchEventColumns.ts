import { MigrationInterface, QueryRunner } from 'typeorm';

export class RefactorMatchEventColumns1765000000001 implements MigrationInterface {
    name = 'RefactorMatchEventColumns1765000000001';

    public async up(queryRunner: QueryRunner): Promise<void> {
        // 1. Add new fixed columns
        await queryRunner.query(`
            ALTER TABLE "match_event"
            ADD COLUMN IF NOT EXISTS "phase" VARCHAR(16) DEFAULT 'FIRST_HALF'
        `);

        await queryRunner.query(`
            ALTER TABLE "match_event"
            ADD COLUMN IF NOT EXISTS "lane" VARCHAR(8)
        `);

        await queryRunner.query(`
            ALTER TABLE "match_event"
            ADD COLUMN IF NOT EXISTS "is_home" BOOLEAN
        `);

        // 2. Add Generated Columns (STORED = physically stored, auto-maintained by PostgreSQL)
        // These are derived from the JSONB data field and enable indexed queries
        await queryRunner.query(`
            ALTER TABLE "match_event"
            ADD COLUMN IF NOT EXISTS "shot_type" VARCHAR(32)
            GENERATED ALWAYS AS (data->>'shotType') STORED
        `);

        await queryRunner.query(`
            ALTER TABLE "match_event"
            ADD COLUMN IF NOT EXISTS "body_part" VARCHAR(16)
            GENERATED ALWAYS AS (data->>'bodyPart') STORED
        `);

        await queryRunner.query(`
            ALTER TABLE "match_event"
            ADD COLUMN IF NOT EXISTS "card_type" VARCHAR(16)
            GENERATED ALWAYS AS (data->>'cardType') STORED
        `);

        await queryRunner.query(`
            ALTER TABLE "match_event"
            ADD COLUMN IF NOT EXISTS "injury_severity" VARCHAR(16)
            GENERATED ALWAYS AS (data->>'severity') STORED
        `);

        await queryRunner.query(`
            ALTER TABLE "match_event"
            ADD COLUMN IF NOT EXISTS "sub_position" VARCHAR(16)
            GENERATED ALWAYS AS (data->>'position') STORED
        `);

        await queryRunner.query(`
            ALTER TABLE "match_event"
            ADD COLUMN IF NOT EXISTS "penalty_outcome" VARCHAR(16)
            GENERATED ALWAYS AS (data->>'outcome') STORED
        `);

        // 3. Add indexes on generated columns (partial indexes for non-null values)
        await queryRunner.query(`
            CREATE INDEX IF NOT EXISTS "IDX_match_event_type"
            ON "match_event" ("type")
        `);

        await queryRunner.query(`
            CREATE INDEX IF NOT EXISTS "IDX_match_event_phase_minute"
            ON "match_event" ("phase", "minute")
        `);

        await queryRunner.query(`
            CREATE INDEX IF NOT EXISTS "IDX_match_event_shot_type"
            ON "match_event" ("shot_type")
            WHERE "shot_type" IS NOT NULL
        `);

        await queryRunner.query(`
            CREATE INDEX IF NOT EXISTS "IDX_match_event_body_part"
            ON "match_event" ("body_part")
            WHERE "body_part" IS NOT NULL
        `);

        await queryRunner.query(`
            CREATE INDEX IF NOT EXISTS "IDX_match_event_card_type"
            ON "match_event" ("card_type")
            WHERE "card_type" IS NOT NULL
        `);

        await queryRunner.query(`
            CREATE INDEX IF NOT EXISTS "IDX_match_event_player_type"
            ON "match_event" ("player_id", "type")
            WHERE "player_id" IS NOT NULL
        `);

        await queryRunner.query(`
            CREATE INDEX IF NOT EXISTS "IDX_match_event_injury_severity"
            ON "match_event" ("injury_severity")
            WHERE "injury_severity" IS NOT NULL
        `);

        // 4. Update existing events: backfill phase based on minute
        await queryRunner.query(`
            UPDATE "match_event"
            SET "phase" = CASE
                WHEN "minute" >= 0 AND "minute" <= 45 THEN 'FIRST_HALF'::varchar
                WHEN "minute" >= 46 AND "minute" <= 90 THEN 'SECOND_HALF'::varchar
                WHEN "minute" >= 91 AND "minute" <= 105 THEN 'EXTRA_FIRST'::varchar
                WHEN "minute" >= 106 AND "minute" <= 120 THEN 'EXTRA_SECOND'::varchar
                WHEN "type" = 25 THEN 'PENALTY_SHOOTOUT'::varchar
                ELSE 'FIRST_HALF'::varchar
            END
        `);

        // 5. Add NOT NULL constraint after backfill
        await queryRunner.query(`
            ALTER TABLE "match_event"
            ALTER COLUMN "phase" SET NOT NULL
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "match_event" DROP COLUMN IF EXISTS "phase"`);
        await queryRunner.query(`ALTER TABLE "match_event" DROP COLUMN IF EXISTS "lane"`);
        await queryRunner.query(`ALTER TABLE "match_event" DROP COLUMN IF EXISTS "is_home"`);
        await queryRunner.query(`ALTER TABLE "match_event" DROP COLUMN IF EXISTS "shot_type"`);
        await queryRunner.query(`ALTER TABLE "match_event" DROP COLUMN IF EXISTS "body_part"`);
        await queryRunner.query(`ALTER TABLE "match_event" DROP COLUMN IF EXISTS "card_type"`);
        await queryRunner.query(`ALTER TABLE "match_event" DROP COLUMN IF EXISTS "injury_severity"`);
        await queryRunner.query(`ALTER TABLE "match_event" DROP COLUMN IF EXISTS "sub_position"`);
        await queryRunner.query(`ALTER TABLE "match_event" DROP COLUMN IF EXISTS "penalty_outcome"`);

        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_match_event_type"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_match_event_phase_minute"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_match_event_shot_type"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_match_event_body_part"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_match_event_card_type"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_match_event_player_type"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_match_event_injury_severity"`);
    }
}
