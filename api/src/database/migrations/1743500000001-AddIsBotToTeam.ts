import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddIsBotToTeam1743500000001 implements MigrationInterface {
    name = 'AddIsBotToTeam1743500000001';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.addColumn(
            'team',
            new TableColumn({
                name: 'is_bot',
                type: 'boolean',
                default: true,
            }),
        );

        await queryRunner.addColumn(
            'team',
            new TableColumn({
                name: 'bot_level',
                type: 'int',
                default: 5,
            }),
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.dropColumn('team', 'is_bot');
        await queryRunner.dropColumn('team', 'bot_level');
    }
}
