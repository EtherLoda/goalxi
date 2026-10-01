import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Make `team.user_id` nullable.
 *
 * ## Why
 *
 * Bot teams no longer have a fake owning user (the
 * pre-init `UserGenerator` was deleted in commit
 * `cc762f5`; see the rationale in
 * `CreateTeamParams.userId` in
 * `libs/database/src/services/team-onboarding-generator.ts`).
 * The init path now writes `userId: null` on every
 * bot team row, which matches the entity type
 * (`userId: string | null`).
 *
 * The `team.user_id` column was created as
 * `uuid NOT NULL` in the original schema
 * (`1700000000001-InitialSchema.ts:62`). The
 * entity-level "nullable" change in commit
 * `c34124d` was a TypeScript-only fix; this
 * migration completes the schema-side half so a
 * fresh `pnpm init:run --force` actually inserts
 * the bot teams without the
 * `23502 — null value in column "user_id" of
 * relation "team" violates not-null constraint`
 * error.
 *
 * The foreign-key constraint
 * `FK_add64c4bdc53d926d9c0992bccc` on `user_id` is
 * NOT affected by NOT NULL — it remains in place
 * and continues to enforce "every non-NULL
 * `user_id` references an existing `user.id`". A
 * manager-owned team still has a real FK to a
 * real user; a bot team has `user_id IS NULL`
 * and the constraint doesn't fire (FK is only
 * checked on non-NULL values).
 *
 * ## Data migration
 *
 * None. The column stays as-is for every existing
 * row. Pre-this-migration rows from old inits
 * had a non-NULL `user_id` pointing to a
 * `bot_manager` user that no longer exists
 * (because the `UserGenerator` was deleted in
 * `cc762f5`); those rows are now orphans in the
 * sense that the FK resolves to a missing user.
 * The FK constraint doesn't reject them (it's
 * NOT VALIDATED against existing rows by
 * `ALTER TABLE ... DROP NOT NULL`), but a future
 * maintenance step could re-point or null them
 * out. A fresh `pnpm init:run --force` produces
 * `user_id IS NULL` rows directly, so the
 * orphan-UUID concern is moot for the
 * `--force` path.
 */
export class MakeTeamUserIdNullable1788000000003 implements MigrationInterface {
  name = 'MakeTeamUserIdNullable1788000000003';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "team" ALTER COLUMN "user_id" DROP NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Pre-check: every row must have a non-NULL
    // `user_id` before the column can be re-pinned
    // to NOT NULL. If any row is null (which is the
    // post-`cc762f5` reality for every fresh init),
    // the down() aborts with a clear error rather
    // than corrupting the table.
    const nullCount = await queryRunner.query(`
      SELECT COUNT(*)::int AS n
        FROM "team"
       WHERE "user_id" IS NULL
    `);
    if (nullCount[0].n > 0) {
      throw new Error(
        `[1788000000003] cannot re-add NOT NULL on team.user_id: ` +
          `${nullCount[0].n} rows have NULL user_id. Either delete ` +
          `those rows (the bot teams from a post-cc762f5 init) or ` +
          `backfill them with a real user_id before running this ` +
          `migration's down().`,
      );
    }
    await queryRunner.query(`
      ALTER TABLE "team" ALTER COLUMN "user_id" SET NOT NULL
    `);
  }
}
