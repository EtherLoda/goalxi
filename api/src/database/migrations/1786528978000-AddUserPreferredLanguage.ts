import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds `preferred_language` to `user` for the "remember the user's
 * locale" flow.
 *
 * - varchar(8), NOT NULL, default 'en'. Every existing user gets
 *   the fallback locale so no rows violate the NOT NULL
 *   constraint during the backfill; the AuthContext already
 *   keys on `user.preferredLanguage` to redirect after login,
 *   so a user that pre-existed this migration simply gets
 *   'en' on their next login. They can switch via the language
 *   switcher in the navbar; we don't backfill from the
 *   `Accept-Language` header (a stale browser preference is
 *   worse than a wrong-but-clearly-default value).
 * - varchar(8) is sized for the next-intl locale codes we
 *   support today ('en', 'zh'). When a third locale lands
 *   (e.g. 'pt-BR'), bump the length in a follow-up migration
 *   — `ALTER TABLE ... ALTER COLUMN preferred_language TYPE
 *   varchar(16)` is a non-blocking metadata-only change in
 *   Postgres 12+.
 *
 * Companion changes:
 *   - `UserEntity.preferredLanguage` (libs/database) — column
 *     on the model side.
 *   - `AuthService.register` (api) — writes the user's current
 *     URL locale at registration.
 *   - `AuthContext.login` (web) — reads the field and routes
 *     the post-login redirect to `/<preferredLanguage>/...`.
 */
export class AddUserPreferredLanguage1786528978000 implements MigrationInterface {
  name = 'AddUserPreferredLanguage1786528978000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "user"
      ADD COLUMN IF NOT EXISTS "preferred_language" varchar(8) NOT NULL DEFAULT 'en'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "user" DROP COLUMN IF EXISTS "preferred_language"`,
    );
  }
}
