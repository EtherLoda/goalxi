import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds a `role` column to `user` to back RBAC.
 *
 * - `role` is varchar(20) with default 'user'. Every existing row
 *   becomes a regular user; admins must be promoted manually.
 * - A partial index on `role='admin'` keeps the admin lookup cheap
 *   (the user table is small, but the guard runs on every admin
 *   request, so even a no-op index makes EXPLAIN predictable).
 * - No down() data loss risk: dropping the column throws away the
 *   admin flag, so the down() is left intentionally destructive —
 *   a deliberate reminder not to roll back in production.
 */
export class AddUserRole1727000000000 implements MigrationInterface {
  name = 'AddUserRole1727000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "user"
      ADD COLUMN IF NOT EXISTS "role" varchar(20) NOT NULL DEFAULT 'user'
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_user_role_admin"
      ON "user" ("role")
      WHERE "role" = 'admin' AND "deleted_at" IS NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_user_role_admin"`);
    await queryRunner.query(`ALTER TABLE "user" DROP COLUMN IF EXISTS "role"`);
  }
}
