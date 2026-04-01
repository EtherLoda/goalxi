import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddWeatherEntity1765100000001 implements MigrationInterface {
    name = 'AddWeatherEntity1765100000001';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS "weather" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "date" date NOT NULL,
                "location_id" varchar(50) NOT NULL DEFAULT 'default',
                "actual_weather" varchar(20) NOT NULL,
                "forecasts" jsonb,
                "tomorrow_weather" varchar(20),
                "created_at" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
                "updated_at" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
                CONSTRAINT "weather_pk" PRIMARY KEY ("id")
            )
        `);

        await queryRunner.query(`
            CREATE UNIQUE INDEX IF NOT EXISTS "idx_weather_date_location"
            ON "weather" ("date", "location_id")
        `);

        // Add weather column to match table
        await queryRunner.query(`
            ALTER TABLE "match"
            ADD COLUMN IF NOT EXISTS "weather" varchar(20)
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "match"
            DROP COLUMN IF EXISTS "weather"
        `);

        await queryRunner.query(`
            DROP INDEX IF EXISTS "idx_weather_date_location"
        `);

        await queryRunner.query(`
            DROP TABLE IF EXISTS "weather"
        `);
    }
}
