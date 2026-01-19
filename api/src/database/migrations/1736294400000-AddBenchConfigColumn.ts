import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddBenchConfigColumn1736294400000 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "team" ADD COLUMN "bench_config" jsonb NULL;
            COMMENT ON COLUMN "team"."bench_config" IS 'Bench configuration for substitutions';
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "team" DROP COLUMN "bench_config";
        `);
    }
}
