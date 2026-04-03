import { MigrationInterface, QueryRunner } from 'typeorm';

export class UpdatePlayerBirthdayType1733149600000 implements MigrationInterface {
  name = 'UpdatePlayerBirthdayType1733149600000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            ALTER TABLE "player" 
            ALTER COLUMN "birthday" TYPE date
        `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            ALTER TABLE "player" 
            ALTER COLUMN "birthday" TYPE timestamp
        `);
  }
}
