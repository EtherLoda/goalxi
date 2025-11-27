import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddFootballManagerFieldsToUser1732677262000
    implements MigrationInterface {
    name = 'AddFootballManagerFieldsToUser1732677262000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
      ALTER TABLE "user" 
      DROP COLUMN IF EXISTS "image",
      ADD COLUMN IF NOT EXISTS "nickname" VARCHAR(50),
      ADD COLUMN IF NOT EXISTS "avatar" VARCHAR NOT NULL DEFAULT '',
      ADD COLUMN IF NOT EXISTS "supporter_level" INTEGER NOT NULL DEFAULT 0
    `);

        await queryRunner.query(`
      COMMENT ON COLUMN "user"."supporter_level" IS '0 = no, 1 = tier1, 2 = tier2, 3 = tier3'
    `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
      ALTER TABLE "user" 
      DROP COLUMN IF EXISTS "supporter_level",
      DROP COLUMN IF EXISTS "avatar",
      DROP COLUMN IF EXISTS "nickname",
      ADD COLUMN IF NOT EXISTS "image" VARCHAR NOT NULL DEFAULT ''
    `);
    }
}
