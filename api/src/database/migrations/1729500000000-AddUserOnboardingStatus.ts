import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds `onboarding_status` to `user` for the register→claim flow.
 *
 * - varchar(20), NOT NULL, default 'teamless'. Every existing user
 *   who already has a team is backfilled to 'active' so the
 *   `onboarding/state` endpoint can correctly skip the redirect for
 *   them — the alternative (leave them 'teamless' forever) would
 *   bounce all pre-migration users into the onboarding UI on their
 *   next login, which is a worse bug.
 *
 * - Partial index on 'teamless' keeps the per-registration assignment
 *   query cheap. The user table is small, but the assigner runs
 *   during the register hot path, so even a tiny win on the
 *   "is there a stray teamless user?" scan matters.
 *
 * - down() is destructive: rolling back leaves every user flagged
 *   'teamless' but with their team still attached, which is exactly
 *   the migration hazard a future rollback is most likely to
 *   introduce. Document it; don't try to be clever.
 */
export class AddUserOnboardingStatus1729500000000 implements MigrationInterface {
  name = 'AddUserOnboardingStatus1729500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "user"
      ADD COLUMN IF NOT EXISTS "onboarding_status" varchar(20) NOT NULL DEFAULT 'teamless'
    `);

    // Backfill: any user who already owns a team is 'active'.
    // We piggyback on the existing partial unique index semantics —
    // if a user has a row in `team` pointing at them, they're done.
    await queryRunner.query(`
      UPDATE "user" u
      SET "onboarding_status" = 'active'
      WHERE EXISTS (
        SELECT 1 FROM "team" t
        WHERE t."user_id" = u.id
          AND t."is_bot" = false
          AND t."deleted_at" IS NULL
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_user_onboarding_status_teamless"
      ON "user" ("onboarding_status")
      WHERE "onboarding_status" = 'teamless' AND "deleted_at" IS NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_user_onboarding_status_teamless"`,
    );
    await queryRunner.query(
      `ALTER TABLE "user" DROP COLUMN IF EXISTS "onboarding_status"`,
    );
  }
}
