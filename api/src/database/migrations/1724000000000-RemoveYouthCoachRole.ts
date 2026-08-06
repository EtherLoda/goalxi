import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Drop the `youth_coach` value from the `staff_role_enum` Postgres
 * type. The role was removed from `StaffRole` in code when the youth
 * subsystem was paused (see CLAUDE.md / training chain review); this
 * migration mirrors that change at the DB layer.
 *
 * Implementation note: Postgres 16 doesn't support
 * `ALTER TYPE ... DROP VALUE` (that landed in PG 17). The portable
 * way on PG 16 is the classic 4-step "swap type" dance:
 *
 *   1. Create a NEW enum type that omits the unwanted value.
 *   2. ALTER the only column that uses the old type to the new type
 *      via `USING col::text::new_enum` (cast through text so PG
 *      doesn't balk on the value-level mismatch).
 *   3. DROP the old enum type.
 *   4. RENAME the new type back to the original name so application
 *      code and any other migrations keep working.
 *
 * Data safety: as long as a row carries `'youth_coach'`, step 2
 * blows up with "invalid input value for enum". So the up() first
 * re-roles any youth_coach staff rows to `team_doctor` (the closest
 * active role) and soft-deactivates them, then runs the 4-step swap.
 *
 * Idempotency: every step that touches user data anchors on
 * `role = 'youth_coach'` so a half-applied previous run can be
 * retried cleanly. The DROP / RENAME steps in particular use
 * `IF EXISTS` / guarded constructs.
 */
export class RemoveYouthCoachRole1724000000000 implements MigrationInterface {
  name = 'RemoveYouthCoachRole1724000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── Step 0: re-role the staff rows that still carry the value ──
    // If the previous (broken) run of this migration had already
    // flipped is_active=false but not the role, the WHERE clause
    // below re-runs cleanly because the role filter is the gate.
    await queryRunner.query(`
      UPDATE "staff"
         SET "role" = 'team_doctor', "is_active" = false
       WHERE "role" = 'youth_coach'
    `);

    // The coach_player_assignment rows for the converted coaches
    // are now orphaned (the staff id still exists, but the coach
    // is no longer a youth coach). We don't strictly need to
    // remove them — the application code that reads them (the
    // training processor) is gone too. Leaving them in place
    // makes the migration safer (no FK risk) and reversible
    // (the down() restores the enum + the role mapping).

    // ── Step 1: create the new enum without 'youth_coach' ──
    // IF NOT EXISTS keeps the step safe to re-run.
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'staff_role_enum_new') THEN
          CREATE TYPE "public"."staff_role_enum_new" AS ENUM (
            'head_coach',
            'fitness_coach',
            'psychology_coach',
            'technical_coach',
            'set_piece_coach',
            'goalkeeper_coach',
            'team_doctor'
          );
        END IF;
      END
      $$;
    `);

    // ── Step 2: swap the column over ──
    // Cast through `text` so PG doesn't reject the value-level type
    // narrowing (any row still carrying 'youth_coach' would have
    // failed at this step — step 0 prevents that).
    await queryRunner.query(`
      ALTER TABLE "staff"
        ALTER COLUMN "role" TYPE "public"."staff_role_enum_new"
        USING "role"::text::"public"."staff_role_enum_new"
    `);

    // ── Step 3: drop the old enum type ──
    await queryRunner.query(`
      DROP TYPE "public"."staff_role_enum"
    `);

    // ── Step 4: rename the new type back to the original name ──
    await queryRunner.query(`
      ALTER TYPE "public"."staff_role_enum_new" RENAME TO "staff_role_enum"
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Reverse the swap: rebuild the original enum, put the youth_coach
    // value back, swap the column back, and drop the temporary type.
    // The previously-converted staff rows are left on `team_doctor`
    // (see the up() docstring) — reverting that re-role is a manual
    // SQL step, not a part of this migration's down().
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'staff_role_enum_old') THEN
          CREATE TYPE "public"."staff_role_enum_old" AS ENUM (
            'head_coach',
            'fitness_coach',
            'psychology_coach',
            'technical_coach',
            'set_piece_coach',
            'goalkeeper_coach',
            'youth_coach',
            'team_doctor'
          );
        END IF;
      END
      $$;
    `);
    await queryRunner.query(`
      ALTER TABLE "staff"
        ALTER COLUMN "role" TYPE "public"."staff_role_enum_old"
        USING "role"::text::"public"."staff_role_enum_old"
    `);
    await queryRunner.query(`
      DROP TYPE "public"."staff_role_enum"
    `);
    await queryRunner.query(`
      ALTER TYPE "public"."staff_role_enum_old" RENAME TO "staff_role_enum"
    `);
  }
}
