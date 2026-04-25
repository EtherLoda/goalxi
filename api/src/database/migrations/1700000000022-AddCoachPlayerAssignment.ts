import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCoachPlayerAssignment1700000000022 implements MigrationInterface {
  name = 'AddCoachPlayerAssignment1700000000022';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "coach_player_assignment" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updated_at" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "coach_id" uuid NOT NULL,
        "player_id" uuid NOT NULL,
        "training_category" varchar(50) NOT NULL,
        "assigned_at" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "PK_coach_player_assignment_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_coach_player_assignment_coach" FOREIGN KEY ("coach_id")
          REFERENCES "staff"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_coach_player_assignment_player" FOREIGN KEY ("player_id")
          REFERENCES "player"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX "IX_coach_player_assignment_unique"
        ON "coach_player_assignment" ("coach_id", "player_id")
    `);

    await queryRunner.query(`
      CREATE INDEX "IX_coach_player_assignment_coach"
        ON "coach_player_assignment" ("coach_id")
    `);

    await queryRunner.query(`
      CREATE INDEX "IX_coach_player_assignment_player"
        ON "coach_player_assignment" ("player_id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IX_coach_player_assignment_player"`);
    await queryRunner.query(`DROP INDEX "IX_coach_player_assignment_coach"`);
    await queryRunner.query(`DROP INDEX "IX_coach_player_assignment_unique"`);
    await queryRunner.query(`DROP TABLE "coach_player_assignment"`);
  }
}
