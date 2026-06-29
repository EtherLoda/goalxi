import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Replace `birthday` (Date) with `createdDay` (int) on both `player` and
 * `youth_player`. Age is now derived as
 * `floor((currentGameDay - createdDay) / GAME_SETTINGS.DAYS_PER_YEAR)`,
 * independent of real-world timezones.
 *
 * Backfill strategy: convert the existing real-year birthday into the
 * game-day equivalent so the displayed age of every pre-existing player
 * is preserved after the column swap.
 *
 * `currentGameDay` is computed inline as
 *   floor(extract(epoch from now() - '2024-01-01 00:00:00Z') / 86400)
 * to keep the migration deterministic and avoid importing the app's
 * `game-clock` util (which is not available at migration time).
 */

const GAME_EPOCH_ISO = '1970-01-01T00:00:00Z';
const GAME_DAYS_PER_YEAR = 112;
const REAL_DAYS_PER_YEAR = 365.25;

export class ReplaceBirthdayWithCreatedDay1721000000000
  implements MigrationInterface
{
  name = 'ReplaceBirthdayWithCreatedDay1721000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Add columns as nullable first so backfill can run.
    await queryRunner.query(
      `ALTER TABLE "player" ADD COLUMN "created_day" int`,
    );
    await queryRunner.query(
      `ALTER TABLE "youth_player" ADD COLUMN "created_day" int`,
    );

    // 2. Backfill — convert (now - birthday) / 365.25 real years into game
    //    days (×112) and subtract from currentGameDay.
    await queryRunner.query(`
      WITH clock AS (
        SELECT floor(
          extract(epoch from (now() AT TIME ZONE 'UTC') - '${GAME_EPOCH_ISO}'::timestamptz) / 86400
        )::int AS today
      )
      UPDATE "player" p
      SET created_day = c.today - floor(
        extract(epoch from (now() - p.birthday)) / 86400
        * ${GAME_DAYS_PER_YEAR} / ${REAL_DAYS_PER_YEAR}
      )::int
      FROM clock c
      WHERE p.birthday IS NOT NULL
    `);

    await queryRunner.query(`
      WITH clock AS (
        SELECT floor(
          extract(epoch from (now() AT TIME ZONE 'UTC') - '${GAME_EPOCH_ISO}'::timestamptz) / 86400
        )::int AS today
      )
      UPDATE "youth_player" yp
      SET created_day = c.today - floor(
        extract(epoch from (now() - yp.birthday)) / 86400
        * ${GAME_DAYS_PER_YEAR} / ${REAL_DAYS_PER_YEAR}
      )::int
      FROM clock c
      WHERE yp.birthday IS NOT NULL
    `);

    // 3. Drop old column. (Birthday on player is nullable, so some rows may
    //    not have been backfilled — that's OK, created_day is also nullable
    //    for those; UI should treat null as "unknown".)
    await queryRunner.query(`ALTER TABLE "player" DROP COLUMN "birthday"`);
    await queryRunner.query(
      `ALTER TABLE "youth_player" DROP COLUMN "birthday"`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Reverse: re-add birthday (date) and backfill from created_day.
    await queryRunner.query(
      `ALTER TABLE "player" ADD COLUMN "birthday" date`,
    );
    await queryRunner.query(
      `ALTER TABLE "youth_player" ADD COLUMN "birthday" date`,
    );

    await queryRunner.query(`
      WITH clock AS (
        SELECT floor(
          extract(epoch from (now() AT TIME ZONE 'UTC') - '${GAME_EPOCH_ISO}'::timestamptz) / 86400
        )::int AS today
      )
      UPDATE "player" p
      SET birthday = (now() - ((c.today - p.created_day) * 86400 * ${REAL_DAYS_PER_YEAR} / ${GAME_DAYS_PER_YEAR}) * interval '1 second')::date
      FROM clock c
      WHERE p.created_day IS NOT NULL
    `);

    await queryRunner.query(`
      WITH clock AS (
        SELECT floor(
          extract(epoch from (now() AT TIME ZONE 'UTC') - '${GAME_EPOCH_ISO}'::timestamptz) / 86400
        )::int AS today
      )
      UPDATE "youth_player" yp
      SET birthday = (now() - ((c.today - yp.created_day) * 86400 * ${REAL_DAYS_PER_YEAR} / ${GAME_DAYS_PER_YEAR}) * interval '1 second')::date
      FROM clock c
      WHERE yp.created_day IS NOT NULL
    `);

    await queryRunner.query(`ALTER TABLE "player" DROP COLUMN "created_day"`);
    await queryRunner.query(
      `ALTER TABLE "youth_player" DROP COLUMN "created_day"`,
    );
  }
}