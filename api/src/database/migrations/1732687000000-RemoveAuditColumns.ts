import { MigrationInterface, QueryRunner } from 'typeorm';

export class RemoveAuditColumns1732687000000 implements MigrationInterface {
    name = 'RemoveAuditColumns1732687000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Drop post table (we removed the Post module)
        await queryRunner.query(`DROP TABLE IF EXISTS "post" CASCADE`);

        // Remove created_by and updated_by from user table
        await queryRunner.query(`ALTER TABLE "user" DROP COLUMN IF EXISTS "created_by"`);
        await queryRunner.query(`ALTER TABLE "user" DROP COLUMN IF EXISTS "updated_by"`);

        // Remove created_by and updated_by from session table
        await queryRunner.query(`ALTER TABLE "session" DROP COLUMN IF EXISTS "created_by"`);
        await queryRunner.query(`ALTER TABLE "session" DROP COLUMN IF EXISTS "updated_by"`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Add them back if needed
        await queryRunner.query(`ALTER TABLE "user" ADD COLUMN "created_by" VARCHAR NOT NULL DEFAULT 'system'`);
        await queryRunner.query(`ALTER TABLE "user" ADD COLUMN "updated_by" VARCHAR NOT NULL DEFAULT 'system'`);

        await queryRunner.query(`ALTER TABLE "session" ADD COLUMN "created_by" VARCHAR NOT NULL DEFAULT 'system'`);
        await queryRunner.query(`ALTER TABLE "session" ADD COLUMN "updated_by" VARCHAR NOT NULL DEFAULT 'system'`);
    }
}
