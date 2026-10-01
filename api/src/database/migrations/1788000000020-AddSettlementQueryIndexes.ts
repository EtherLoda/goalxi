import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Add the indexes the season-end and season-start settlement passes
 * were missing.
 *
 * ## Why
 *
 * Three settlement paths run full sequential scans because the column
 * they filter on is the leading column of no index:
 *
 * **1. `transaction.season` — no index at all.**
 * `SeasonArchiveService.archiveTransactions` does
 * `transactionRepo.find({ where: { season } })` at season end and maps
 * every row into a second in-memory array. The destination table
 * (`archived_transaction`) *does* have `(season, type)`, but that
 * doesn't help the source scan. Volume is 200k-400k rows per season
 * (1360 teams x 16 weeks of sponsorship / wages / staff / youth /
 * stadium, plus one ticket-income row per match), so this materialised
 * the whole ledger into Node memory.
 *
 * **2. `team.league_id` — no index.**
 * `league_id` is a FK-less plain uuid column, so no index is
 * auto-created. `LeagueStandingService.initNewSeasonStandings` does
 * `teamRepository.find({ where: { leagueId } })` once per league — 85
 * sequential scans of the team table per season transition.
 * `TeamEntity` also has no `@Index` decorator for it.
 *
 * **3. `match.(league_id, season, status)` — not covered.**
 * `match` has `(league_id, season, week)`, `(league_id, season,
 * round)` and `(stadium_id)`. `LeagueAwardService` /
 * `SeasonTransitionService` filter on `(season, week, type, status)`
 * and the PUBLIC `LeagueService.getStandings` loads every completed
 * match in the season (`where: { leagueId, season, status: 'completed'
 * }`, ordered by `completedAt DESC`) — none of which the existing
 * indexes serve, on an unauthenticated endpoint.
 *
 * ## Index choices
 *
 * - `transaction (season, team_id)` — leading `season` serves the
 *   archive scan; `team_id` is included because the finance history
 *   view filters on both.
 * - `team (league_id)` — plain, matching the single-column lookup.
 * - `match (league_id, season, status, completed_at DESC)` — covers the
 *   standings/recent-form read exactly: three equality predicates then
 *   an ordered scan, so no sort node is needed.
 *
 * All three are additive and safe to run against a live database:
 * PostgreSQL builds them without locking out writes for more than a
 * moment, and none changes query semantics.
 *
 * `IF NOT EXISTS` is used so this is safe to re-run on a database where
 * an operator already added the index by hand.
 */
export class AddSettlementQueryIndexes1788000000020 implements MigrationInterface {
  name = 'AddSettlementQueryIndexes1788000000020';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Season-end archive scan over the whole finance ledger.
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_transaction_season_team"
      ON "transaction" ("season", "team_id")
    `);

    // 2. Per-league team lookup at season transition. `league_id` is a
    //    plain uuid with no FK, so nothing created this implicitly.
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_team_league_id"
      ON "team" ("league_id")
    `);

    // 3. Completed-match lookup for a league+season, already ordered —
    //    the shape `LeagueService.getStandings` needs to build the
    //    recent-form strip without a sort node.
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_match_league_season_status_completed"
      ON "match" ("league_id", "season", "status", "completed_at" DESC)
    `);

    // 4. `SeasonTransitionService.areAllWeekMatchesCompleted` and the
    //    playoff gate both count matches by (season, week, type,
    //    status) with no league filter.
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_match_season_week_type_status"
      ON "match" ("season", "week", "type", "status")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_match_season_week_type_status"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_match_league_season_status_completed"`,
    );
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_team_league_id"`);
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_transaction_season_team"`,
    );
  }
}
