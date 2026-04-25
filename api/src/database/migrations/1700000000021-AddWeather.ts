import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddWeather1700000000021 implements MigrationInterface {
  name = 'AddWeather1700000000021';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "weather" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updated_at" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "date" date NOT NULL,
        "location_id" varchar(50) NOT NULL DEFAULT 'default',
        "actual_weather" varchar(20) NOT NULL,
        "forecasts" jsonb,
        "tomorrow_weather" varchar(20),
        CONSTRAINT "PK_weather_id" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX "IX_weather_date_location" ON "weather" ("date", "location_id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IX_weather_date_location"`);
    await queryRunner.query(`DROP TABLE "weather"`);
  }
}
