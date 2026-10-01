/**
 * Tripwire spec for migration
 * 1788000000003-MakeTeamUserIdNullable.
 *
 * The TS-level half of the "bot teams have no owner"
 * change landed in commit `c34124d`
 * (`CreateTeamParams.userId: string | null`); this
 * migration is the DB-level half (DROP NOT NULL on
 * `team.user_id`). A fresh `pnpm init:run --force`
 * fails with PG error 23502 unless this migration
 * has run, so the migration is on the critical
 * path for any rebuild.
 *
 * Pure unit — no DB connection. Source-greps the
 * migration file to enforce:
 *   1. up() drops NOT NULL on team.user_id
 *   2. down() re-adds NOT NULL
 *   3. down() pre-checks for NULL rows and aborts
 *      with a clear error rather than corrupting
 *      the table
 *   4. The migration name + class name follow
 *      project convention (matches the
 *      `1788000000003-...ts` filename)
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('1788000000003-MakeTeamUserIdNullable migration', () => {
  const source = readFileSync(
    join(__dirname, '1788000000003-MakeTeamUserIdNullable.ts'),
    'utf8',
  );

  describe('up() — drops NOT NULL on team.user_id', () => {
    it('issues the DROP NOT NULL statement', () => {
      // Pin the SQL shape so a future "let me also
      // re-type the column to text" rewrite (or any
      // other ALTER on team.user_id) fails the test.
      expect(source).toMatch(
        /ALTER TABLE "team" ALTER COLUMN "user_id" DROP NOT NULL/,
      );
    });
  });

  describe('down() — restores NOT NULL with a NULL-row safety check', () => {
    it('issues the SET NOT NULL statement', () => {
      expect(source).toMatch(
        /ALTER TABLE "team" ALTER COLUMN "user_id" SET NOT NULL/,
      );
    });

    it('pre-checks for NULL rows and aborts with a clear error', () => {
      // The down() must not silently re-add NOT NULL
      // when NULL rows exist (the post-cc762f5 init
      // produces them; running the down() on such a
      // DB without backfill would corrupt the table).
      // The pre-check uses a clear error message
      // pointing the operator at the right remediation
      // (delete or backfill the NULL rows).
      expect(source).toMatch(/user_id" IS NULL/);
      expect(source).toMatch(/cannot re-add NOT NULL/);
    });
  });

  describe('naming convention', () => {
    it('class name follows the `<Description><Timestamp>` project convention', () => {
      // The data-source.ts migration loader uses the
      // `name` field, not the class name, to track
      // applied migrations. Both must be present and
      // timestamp-suffixed.
      expect(source).toMatch(/class\s+MakeTeamUserIdNullable1788000000003/);
      expect(source).toMatch(
        /name\s*=\s*['"]MakeTeamUserIdNullable1788000000003['"]/,
      );
    });

    it('does not also drop the FK constraint (NOT NULL is independent of FK)', () => {
      // The FK `FK_add64c4bdc53d926d9c0992bccc` on
      // `user_id` stays in place — bot teams have
      // `user_id IS NULL` which the FK is allowed to
      // not check (FKs only constrain non-NULL
      // values). A migration that also dropped the
      // FK would break the "real user FK" case.
      expect(source).not.toMatch(/DROP CONSTRAINT.*user_id/i);
    });
  });
});
