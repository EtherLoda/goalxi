import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * §5 Stadium — Time-based construction queue.
 *
 * Adds the `stadium_construction` table that backs the new dialog-driven
 * expand/demolish flow. Rows are created by `StadiumConstructionService.start`,
 * ticked down weekly by `StadiumConstructionProcessor`, and finalized when
 * `remaining_weeks` hits 0 (capacity is applied to `stadium` and a
 * notification fires for the team manager).
 */
export class AddStadiumConstruction1719300000000 implements MigrationInterface {
  name = 'AddStadiumConstruction1719300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "stadium_construction_kind_enum" AS ENUM ('EXPAND', 'DEMOLISH')
    `);

    await queryRunner.query(`
      CREATE TYPE "stadium_construction_status_enum" AS ENUM (
        'IN_PROGRESS',
        'COMPLETED',
        'CANCELLED'
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "stadium_construction" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        "team_id" uuid NOT NULL,
        "kind" "stadium_construction_kind_enum" NOT NULL,
        "delta_seats" integer NOT NULL,
        "starting_capacity" integer NOT NULL,
        "ending_capacity" integer NOT NULL,
        "total_weeks" integer NOT NULL,
        "remaining_weeks" integer NOT NULL,
        "cost" integer NOT NULL,
        "refund" integer NOT NULL DEFAULT 0,
        "status" "stadium_construction_status_enum" NOT NULL DEFAULT 'IN_PROGRESS',
        "season_started" integer NOT NULL,
        "week_started" integer NOT NULL,
        "season_completed" integer,
        "week_completed" integer,
        "completed_at" TIMESTAMP WITH TIME ZONE,
        CONSTRAINT "PK_stadium_construction_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_stadium_construction_team_id"
          FOREIGN KEY ("team_id") REFERENCES "team"("id")
          ON DELETE CASCADE
      )
    `);

    // Hot-path index: team page lists active + completed projects for a team.
    await queryRunner.query(`
      CREATE INDEX "IDX_stadium_construction_team_status"
        ON "stadium_construction" ("team_id", "status")
    `);

    // Hot-path index: weekly processor scans all in-flight rows.
    await queryRunner.query(`
      CREATE INDEX "IDX_stadium_construction_status_remaining"
        ON "stadium_construction" ("status", "remaining_weeks")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_stadium_construction_status_remaining"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_stadium_construction_team_status"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "stadium_construction"`);
    await queryRunner.query(
      `DROP TYPE IF EXISTS "stadium_construction_status_enum"`,
    );
    await queryRunner.query(
      `DROP TYPE IF EXISTS "stadium_construction_kind_enum"`,
    );
  }
}
