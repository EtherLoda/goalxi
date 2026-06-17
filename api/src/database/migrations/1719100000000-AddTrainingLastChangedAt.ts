import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Add training_intensity_last_changed_at to team for the §5.4 weekly limit.
 */
export class AddTrainingLastChangedAt1719100000000 implements MigrationInterface {
    name = 'AddTrainingLastChangedAt1719100000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "team"
            ADD COLUMN "training_intensity_last_changed_at" timestamptz
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "team"
            DROP COLUMN "training_intensity_last_changed_at"
        `);
    }
}
