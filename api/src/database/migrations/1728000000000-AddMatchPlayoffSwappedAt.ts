import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds `playoff_swapped_at` (timestamptz, nullable) to the `match` table.
 *
 * Background: `SeasonTransitionService.processAfterPlayoffsComplete`
 * (the week-16 cron, see commit `2a0d336`) calls
 * `swapTeamLeague(upperTeamId, lowerTeamId, upperLeagueId, lowerLeagueId)`
 * once per playoff row. `swapTeamLeague` mutates `team.leagueId` on
 * both teams, so a second invocation with the same arguments would
 * *un-swap* the pair. The previous "is this already done?" check was
 * missing entirely — re-running the swap (a duplicate cron tick, a
 * manual re-deploy, a redelivered BullMQ message) would corrupt
 * every promoted/relegated team's league assignment.
 *
 * The marker is on the **playoff match row** (not on the team)
 * because:
 *  - the swap is a property of the playoff fixture, not of the
 *    teams (a team can play multiple playoffs over its lifetime);
 *  - it lets the next season's playoffs start with `null` (fresh)
 *    without resetting anything per-team;
 *  - a `WHERE playoff_swapped_at IS NULL` filter on the playoff
 *    query is naturally indexed by a future partial index.
 *
 * Nullable + no default → existing rows are treated as
 * "not yet swapped", so the column is safe to backfill on a
 * production database that's already past the season-end.
 */
export class AddMatchPlayoffSwappedAt1728000000000
  implements MigrationInterface
{
  name = 'AddMatchPlayoffSwappedAt1728000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "match"
      ADD COLUMN IF NOT EXISTS "playoff_swapped_at" timestamptz
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "match" DROP COLUMN IF EXISTS "playoff_swapped_at"
    `);
  }
}
