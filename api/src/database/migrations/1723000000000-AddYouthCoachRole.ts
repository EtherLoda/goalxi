import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Add `youth_coach` to the `staff_role_enum` Postgres type.
 *
 * The `staff.role` column is stored as a native Postgres ENUM
 * (`type: 'enum', enum: StaffRole` on the entity). Adding a new value
 * requires `ALTER TYPE ... ADD VALUE` — `enum` columns cannot be
 * widened by simply inserting new rows. Note: the new value cannot be
 * used in the *same* transaction it was added in, but every migration
 * runner commits between migrations so this is safe.
 *
 * The down() removes the value. Postgres 10+ supports `DROP VALUE` but
 * only if no rows use it; if any staff row has role='youth_coach', the
 * down() will fail — surface that loudly via the `IF EXISTS` guard.
 */
export class AddYouthCoachRole1723000000000 implements MigrationInterface {
  name = 'AddYouthCoachRole1723000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "staff_role_enum" ADD VALUE IF NOT EXISTS 'youth_coach'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Postgres doesn't allow removing an enum value that is in use; the
    // migration will fail at the DB level if any staff row references
    // the value. Wrapping in a DO block gives a clearer error and lets
    // the runner mark the migration as failed loudly.
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM "staff" WHERE "role" = 'youth_coach'
        ) THEN
          RAISE EXCEPTION
            'Cannot drop enum value ''youth_coach'': rows still reference it';
        END IF;
      END
      $$;
    `);
    await queryRunner.query(
      `ALTER TYPE "staff_role_enum" DROP VALUE IF EXISTS 'youth_coach'`,
    );
  }
}
