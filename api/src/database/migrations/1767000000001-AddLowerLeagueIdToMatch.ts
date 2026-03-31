import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddLowerLeagueIdToMatch1767000000001 implements MigrationInterface {
    name = 'AddLowerLeagueIdToMatch1767000000001';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.addColumn(
            'match',
            new TableColumn({
                name: 'lower_league_id',
                type: 'uuid',
                isNullable: true,
            }),
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.dropColumn('match', 'lower_league_id');
    }
}
