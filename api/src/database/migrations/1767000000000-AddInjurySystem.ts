import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddInjurySystem1767000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add injury columns to player table
    await queryRunner.query(`
            ALTER TABLE "player" ADD COLUMN IF NOT EXISTS "current_injury_value" integer DEFAULT 0 NOT NULL;
            ALTER TABLE "player" ADD COLUMN IF NOT EXISTS "injury_type" varchar(20) NULL;
            ALTER TABLE "player" ADD COLUMN IF NOT EXISTS "injured_at" timestamptz NULL;
        `);

    // Create injury table
    await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS "injury" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "player_id" uuid NOT NULL,
                "match_id" uuid NULL,
                "injury_type" varchar(20) NOT NULL,
                "severity" integer NOT NULL,
                "injury_value" integer NOT NULL,
                "estimated_min_days" integer NOT NULL,
                "estimated_max_days" integer NOT NULL,
                "occurred_at" TIMESTAMP WITH TIME ZONE NOT NULL,
                "recovered_at" TIMESTAMP WITH TIME ZONE NULL,
                "is_recovered" boolean DEFAULT false NOT NULL,
                CONSTRAINT "PK_injury_id" PRIMARY KEY ("id")
            )
        `);

    // Create indexes (use IF NOT EXISTS for indexes)
    await queryRunner.query(`
            CREATE INDEX IF NOT EXISTS "IDX_injury_player_id" ON "injury"("player_id")
        `);
    await queryRunner.query(`
            CREATE INDEX IF NOT EXISTS "IDX_injury_is_recovered" ON "injury"("is_recovered")
        `);
    await queryRunner.query(`
            CREATE INDEX IF NOT EXISTS "IDX_injury_occurred_at" ON "injury"("occurred_at")
        `);
    await queryRunner.query(`
            CREATE INDEX IF NOT EXISTS "IDX_player_injured_at" ON "player"("injured_at")
        `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "injury"`);
    await queryRunner.query(`
            ALTER TABLE "player" DROP COLUMN IF EXISTS "current_injury_value";
            ALTER TABLE "player" DROP COLUMN IF EXISTS "injury_type";
            ALTER TABLE "player" DROP COLUMN IF EXISTS "injured_at";
        `);
  }
}
