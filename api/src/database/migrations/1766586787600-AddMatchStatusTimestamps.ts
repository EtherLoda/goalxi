import { MigrationInterface, QueryRunner } from "typeorm";

export class AddMatchStatusTimestamps1766586787600 implements MigrationInterface {
    name = 'AddMatchStatusTimestamps1766586787600'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "match"
            ADD "started_at" TIMESTAMP
        `);
        await queryRunner.query(`
            ALTER TABLE "match"
            ADD "completed_at" TIMESTAMP
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "match" DROP COLUMN "completed_at"
        `);
        await queryRunner.query(`
            ALTER TABLE "match" DROP COLUMN "started_at"
        `);
    }

}
