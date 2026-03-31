import { MigrationInterface, QueryRunner, Table, TableForeignKey, TableIndex, TableColumn } from 'typeorm';

export class AddStadiumAndFanTables1743500000000 implements MigrationInterface {
    name = 'AddStadiumAndFanTables1743500000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Create stadium table
        await queryRunner.createTable(
            new Table({
                name: 'stadium',
                columns: [
                    {
                        name: 'id',
                        type: 'uuid',
                        isPrimary: true,
                        generationStrategy: 'uuid',
                        default: 'uuid_generate_v4()',
                    },
                    {
                        name: 'team_id',
                        type: 'uuid',
                        isNullable: false,
                    },
                    {
                        name: 'capacity',
                        type: 'int',
                        default: 5000,
                    },
                    {
                        name: 'is_built',
                        type: 'boolean',
                        default: true,
                    },
                    {
                        name: 'created_at',
                        type: 'timestamp',
                        default: 'now()',
                    },
                    {
                        name: 'updated_at',
                        type: 'timestamp',
                        default: 'now()',
                    },
                ],
            }),
            true,
        );

        await queryRunner.createIndex(
            'stadium',
            new TableIndex({
                name: 'IDX_stadium_team_id',
                columnNames: ['team_id'],
            }),
        );

        // Create fan table
        await queryRunner.createTable(
            new Table({
                name: 'fan',
                columns: [
                    {
                        name: 'id',
                        type: 'uuid',
                        isPrimary: true,
                        generationStrategy: 'uuid',
                        default: 'uuid_generate_v4()',
                    },
                    {
                        name: 'team_id',
                        type: 'uuid',
                        isNullable: false,
                    },
                    {
                        name: 'total_fans',
                        type: 'int',
                        default: 10000,
                    },
                    {
                        name: 'fan_morale',
                        type: 'int',
                        default: 50,
                    },
                    {
                        name: 'recent_form',
                        type: 'varchar',
                        length: '10',
                        default: "''",
                    },
                    {
                        name: 'created_at',
                        type: 'timestamp',
                        default: 'now()',
                    },
                    {
                        name: 'updated_at',
                        type: 'timestamp',
                        default: 'now()',
                    },
                ],
            }),
            true,
        );

        await queryRunner.createIndex(
            'fan',
            new TableIndex({
                name: 'IDX_fan_team_id',
                columnNames: ['team_id'],
            }),
        );

        // Add elo_rating column to team table
        await queryRunner.addColumn(
            'team',
            new TableColumn({
                name: 'elo_rating',
                type: 'int',
                default: 1500,
            }),
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.dropTable('stadium');
        await queryRunner.dropTable('fan');
        await queryRunner.dropColumn('team', 'elo_rating');
    }
}
