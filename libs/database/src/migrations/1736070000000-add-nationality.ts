import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddNationality1736070000000 implements MigrationInterface {
    name = 'AddNationality1736070000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Add nationality column to player table
        await queryRunner.query(`
            ALTER TABLE "player" ADD COLUMN IF NOT EXISTS "nationality" varchar(2)
        `);

        // Add nationality column to team table
        await queryRunner.query(`
            ALTER TABLE "team" ADD COLUMN IF NOT EXISTS "nationality" varchar(2)
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.dropColumn('player', 'nationality');
        await queryRunner.dropColumn('team', 'nationality');
    }
}
