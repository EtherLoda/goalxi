import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * A dedicated class for `turnover`: TURNOVER (18) + INTERCEPT (29).
 *
 * ## Why the old tuple was wrong
 *
 * `turnover` was folded into SHOT (3) / MISS (4), which reads as "a shot that
 * missed". It is not a shot — it is a possession change. The engine emits it
 * from the interception gate (the ball goes the other way and the new holder
 * gets the counter-attack bonus), never from a shot.
 *
 * ## Why new rows instead of reusing a spare id
 *
 * Class ids 1-17 and outcome ids 1-28 are all taken. Both tables are seeded by
 * migration `1788000000001` with a stable-id contract (no SERIAL), so a new
 * class gets the next free id rather than renumbering anything.
 *
 * ## Idempotency
 *
 * `ON CONFLICT (id) DO NOTHING`, matching the seed migration, so a re-run or a
 * partially applied migration is harmless.
 */
export class AddTurnoverEventClass1788000000110 implements MigrationInterface {
  name = 'AddTurnoverEventClass1788000000110';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO "event_class_def" ("id", "code", "family", "outcomes", "is_visible", "sort_order", "description")
      VALUES (18, 'TURNOVER', 'neutral', ARRAY[29]::SMALLINT[], TRUE, 170, '{"zh":"球权转换","en":"Turnover"}')
      ON CONFLICT ("id") DO NOTHING
    `);

    await queryRunner.query(`
      INSERT INTO "event_outcome_def" ("id", "code", "is_positive", "is_countable", "sort_order", "description")
      VALUES (29, 'INTERCEPT', TRUE, TRUE, 290, '{"zh":"断球","en":"Intercepted"}')
      ON CONFLICT ("id") DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DELETE FROM "event_class_def" WHERE "id" = 18 AND "code" = 'TURNOVER'`,
    );
    await queryRunner.query(
      `DELETE FROM "event_outcome_def" WHERE "id" = 29 AND "code" = 'INTERCEPT'`,
    );
  }
}
