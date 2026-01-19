import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddInjurySystem1767000000000 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        // Add injury columns to player table
        await queryRunner.query(`
            ALTER TABLE "player" ADD COLUMN "current_injury_value" integer DEFAULT 0 NOT NULL;
            ALTER TABLE "player" ADD COLUMN "injury_type" varchar(20) NULL;
            ALTER TABLE "player" ADD COLUMN "injured_at" timestamptz NULL;
        `);

        // Create injury table
        await queryRunner.query(`
            CREATE TABLE "injury" (
                "id" uuid NOT NULL DEFAULT gen_random_uuid(),
                "created_at" timestamptz NOT NULL DEFAULT now(),
                "updated_at" timestamptz NOT NULL DEFAULT now(),
                "player_id" uuid NOT NULL,
                "match_id" uuid NULL,
                "injury_type" varchar(20) NOT NULL,
                "severity" integer NOT NULL,
                "injury_value" integer NOT NULL,
                "estimated_min_days" integer NOT NULL,
                "estimated_max_days" integer NOT NULL,
                "occurred_at" timestamptz NOT NULL,
                "recovered_at" timestamptz NULL,
                "is_recovered" boolean DEFAULT false NOT NULL,
                CONSTRAINT "PK_injury_id" PRIMARY KEY ("id"),
                CONSTRAINT "FK_injury_player_id" FOREIGN KEY ("player_id") REFERENCES "player"("id") ON DELETE CASCADE ON UPDATE NO ACTION
            );
        `);

        // Create indexes
        await queryRunner.query(`
            CREATE INDEX "IDX_injury_player_id" ON "injury"("player_id");
            CREATE INDEX "IDX_injury_is_recovered" ON "injury"("is_recovered");
            CREATE INDEX "IDX_injury_occurred_at" ON "injury"("occurred_at");
            CREATE INDEX "IDX_player_injured_at" ON "player"("injured_at");
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE "injury"`);
        await queryRunner.query(`
            ALTER TABLE "player" DROP COLUMN "current_injury_value";
            ALTER TABLE "player" DROP COLUMN "injury_type";
            ALTER TABLE "player" DROP COLUMN "injured_at";
        `);
    }
}
