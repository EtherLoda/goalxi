import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds `timezone` to `user` for the "remember the user's timezone"
 * flow. This is the FE-only path — see `formatDatetime` in
 * `web/src/lib/format-datetime.ts`. We only use this value to format
 * `Date` objects on the client (via `Intl.DateTimeFormat({ timeZone })`),
 * not to drive server-side timestamps.
 *
 * - varchar(64), NOT NULL, default 'UTC'. The 64-byte cap covers the
 *   longest IANA names we know of (`America/Argentina/Buenos_Aires` =
 *   32 chars), with headroom for future additions.
 * - 'UTC' as the default is the only value that is guaranteed to
 *   exist across every IANA database; using the user's
 *   `Intl.DateTimeFormat().resolvedOptions().timeZone` from the
 *   migration is unreliable (e.g. older Safari returns `undefined`).
 *   The FE auto-detection on first visit (see
 *   `SiteTimezoneForm`) writes the resolved value back via
 *   `PATCH /users/me`, so users only see UTC until they load the
 *   settings page once.
 *
 * Companion changes:
 *   - `UserEntity.timezone` (libs/database) — column on the model.
 *   - `UserResDto.timezone` (api) — exposed in the response.
 *   - `SiteTimezoneForm` (web) — writes the picked value back.
 *   - `formatDatetime` (web) — reads from `gameStore.timezone` and
 *     formats every displayed time with `timeZone: tz`.
 */
export class AddUserTimezone1787000000000 implements MigrationInterface {
  name = 'AddUserTimezone1787000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "user"
      ADD COLUMN IF NOT EXISTS "timezone" varchar(64) NOT NULL DEFAULT 'UTC'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "user" DROP COLUMN IF EXISTS "timezone"`,
    );
  }
}
