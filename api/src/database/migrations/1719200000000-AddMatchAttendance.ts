import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * §5 Stadium — Match attendance
 *
 * Adds `match.attendance` so the Stadium page can compute the season's
 * average attendance rate. Existing rows remain NULL; the service falls back
 * to a deterministic 70% fill of the home stadium's capacity when the value
 * is missing (so legacy matches still contribute a reasonable number).
 */
export class AddMatchAttendance1719200000000 implements MigrationInterface {
  name = 'AddMatchAttendance1719200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            ALTER TABLE "match"
            ADD COLUMN "attendance" integer
        `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            ALTER TABLE "match"
            DROP COLUMN "attendance"
        `);
  }
}