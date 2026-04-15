import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSpecialtyToPlayer1700000000005 implements MigrationInterface {
  name = 'AddSpecialtyToPlayer1700000000005';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "player" ADD COLUMN "specialty" varchar(50)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "player" DROP COLUMN "specialty"
    `);
  }
}
