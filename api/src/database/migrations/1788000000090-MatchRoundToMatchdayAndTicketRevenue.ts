import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * `round` changes meaning: it was the index within a matchweek (1..3), it is
 * now the league matchday for the season (1..ROUNDS_PER_WEEK*weeks).
 *
 * Rows written before this migration still hold the old 1..3 value, so they
 * are widened in place with `(week - 1) * ROUNDS_PER_WEEK + round`. The
 * generator changes in the same commit make every new row store the widened
 * value directly, so this UPDATE must never run twice — it is guarded by
 * `round < GAME_SETTINGS.ROUNDS_PER_WEEK` rather than by a flag, because a
 * genuine matchday of 1..3 can only exist in week 1, and week 1 rows already
 * satisfy `(1 - 1) * 3 + round = round`, making the rewrite a no-op for them.
 *
 * `ticket_revenue` is a denormalised copy of the TICKET_INCOME ledger row that
 * `MatchCompletionService.calculateStadiumRevenue` already writes. The ledger
 * stays the source of truth; this column exists so the match page can show the
 * figure without joining finance for every render. Rows settled before this
 * migration are backfilled from the ledger by `related_id`.
 */
export class MatchRoundToMatchdayAndTicketRevenue1788000000090
  implements MigrationInterface
{
  name = 'MatchRoundToMatchdayAndTicketRevenue1788000000090';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE "match"
      SET "round" = ("week" - 1) * 3 + "round"
      WHERE "round" IS NOT NULL AND "week" > 1 AND "round" <= 3
    `);

    await queryRunner.query(`
      ALTER TABLE "match" ADD COLUMN IF NOT EXISTS "ticket_revenue" integer
    `);

    await queryRunner.query(`
      UPDATE "match" AS m
      SET "ticket_revenue" = t."amount"
      FROM "transaction" AS t
      WHERE t."related_id" = m."id" AND t."type"::text = 'ticket_income'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "match" DROP COLUMN IF EXISTS "ticket_revenue"
    `);

    await queryRunner.query(`
      UPDATE "match"
      SET "round" = ("round" - 1) % 3 + 1
      WHERE "round" IS NOT NULL
    `);
  }
}
