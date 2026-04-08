import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddIsBotToTeam1743500000001 implements MigrationInterface {
  name = 'AddIsBotToTeam1743500000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            ALTER TABLE "team" ADD COLUMN IF NOT EXISTS "is_bot" boolean NOT NULL DEFAULT true
        `);
    await queryRunner.query(`
            ALTER TABLE "team" ADD COLUMN IF NOT EXISTS "bot_level" integer NOT NULL DEFAULT 5
        `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn('team', 'is_bot');
    await queryRunner.dropColumn('team', 'bot_level');
  }
}
