import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTrainingUpdate1700000000024 implements MigrationInterface {
  name = 'AddTrainingUpdate1700000000024';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "training_update" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "team_id" uuid NOT NULL,
        "season" integer NOT NULL,
        "week" integer NOT NULL,
        "player_updates" jsonb NOT NULL DEFAULT '[]',
        "created_at" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updated_at" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "PK_training_update_id" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_training_update_team_id" ON "training_update" ("team_id")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_training_update_team_season_week" ON "training_update" ("team_id", "season", "week")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "training_update"`);
  }
}
