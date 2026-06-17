import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * §5 俱乐部设置页 — 实体扩展迁移
 * - team: 加 founded_year / city / bio / jersey_color_tertiary
 * - stadium: 加 name (默认 'Home Stadium')
 */
export class ClubSettingsAddFields1719000000000 implements MigrationInterface {
    name = 'ClubSettingsAddFields1719000000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "team"
            ADD COLUMN "founded_year" integer,
            ADD COLUMN "city" varchar(64),
            ADD COLUMN "bio" text,
            ADD COLUMN "jersey_color_tertiary" varchar(7) DEFAULT '#000000'
        `);

        await queryRunner.query(`
            ALTER TABLE "stadium"
            ADD COLUMN "name" varchar(128) DEFAULT 'Home Stadium'
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "team"
            DROP COLUMN "founded_year",
            DROP COLUMN "city",
            DROP COLUMN "bio",
            DROP COLUMN "jersey_color_tertiary"
        `);

        await queryRunner.query(`
            ALTER TABLE "stadium"
            DROP COLUMN "name"
        `);
    }
}
