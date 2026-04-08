import { MigrationInterface, QueryRunner } from 'typeorm';

export class UpdatePlayerFormAndStamina1764647470138 implements MigrationInterface {
  name = 'UpdatePlayerFormAndStamina1764647470138';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            ALTER TABLE "player"
            ADD COLUMN IF NOT EXISTS "stamina" double precision NOT NULL DEFAULT 3
        `);
    await queryRunner.query(`
            ALTER TABLE "player" DROP COLUMN IF EXISTS "form"
        `);
    await queryRunner.query(`
            ALTER TABLE "player"
            ADD COLUMN IF NOT EXISTS "form" double precision NOT NULL DEFAULT 3
        `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            ALTER TABLE "player" DROP COLUMN IF EXISTS "form"
        `);
    await queryRunner.query(`
            ALTER TABLE "player"
            ADD COLUMN IF NOT EXISTS "form" integer NOT NULL DEFAULT 5
        `);
    await queryRunner.query(`
            ALTER TABLE "player" DROP COLUMN IF EXISTS "stamina"
        `);
  }
}
