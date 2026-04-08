import { MigrationInterface, QueryRunner } from 'typeorm';

export class RemovePlayerPosition1733150000000 implements MigrationInterface {
  name = 'RemovePlayerPosition1733150000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            ALTER TABLE "player" DROP COLUMN IF EXISTS "position"
        `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            ALTER TABLE "player" 
            ADD COLUMN IF NOT EXISTS "position" character varying
        `);
  }
}
