import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Make `player_competition_stats.league_id` and
 * `archived_player_competition_stats.league_id` nullable.
 *
 * Why (live table): cup and youth matches both have `match.leagueId = null`
 * (cups set it explicitly in `cup-scheduler.service.ts`; youth rows use
 * `match.youthLeagueId` instead). The simulator's
 * `updatePlayerCompetitionStats` writes one row per player per
 * (league, season, player) and was hitting a NOT NULL violation for every
 * non-league match. The DB rejected the insert, the entire simulator
 * transaction rolled back, and the match silently lost:
 *   - match_event rows
 *   - match_team_stats rows
 *   - hat-trick PlayerEvent rows
 *   - player.careerStats.club increments
 *
 * Why (archive table): the settlement's `season-archive.service.ts` copies
 * rows verbatim from the live table to the archive at season end. If the
 * archive's `league_id` stays NOT NULL, the archive insert would reject
 * any null source row and cup/youth stats would be silently dropped at
 * the archive step.
 *
 * PG semantics: UNIQUE constraints treat NULLs as distinct, so a player
 * who plays both league (leagueId=<X>) and cup (leagueId=null) in the same
 * season ends up with two rows instead of one — that's the intended shape.
 * The existing `IDX_*_competition_stats_*` indexes on
 * (leagueId, season, ...) still work with NULL keys; the leaderboard
 * query `WHERE leagueId = $1 AND season = $2` simply returns no cup rows,
 * which is correct (the leaderboard is league-scoped).
 *
 * Idempotent: each `ALTER COLUMN ... DROP NOT NULL` is guarded by an
 * `information_schema` check so a re-run is a no-op even if one of the
 * two tables was already nullable (e.g. a partial prior run).
 */
export class PlayerCompetitionStatsLeagueIdNullable1736000000000
  implements MigrationInterface
{
  name = 'PlayerCompetitionStatsLeagueIdNullable1736000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Live table
    const liveState = await queryRunner.query(`
      SELECT is_nullable
        FROM information_schema.columns
       WHERE table_name = 'player_competition_stats'
         AND column_name = 'league_id'
    `);
    if (
      !(liveState.length > 0 && liveState[0].is_nullable === 'YES')
    ) {
      await queryRunner.query(`
        ALTER TABLE "player_competition_stats"
          ALTER COLUMN "league_id" DROP NOT NULL
      `);
    }

    // 2. Archive table (mirrors the live one for the season-archive service)
    const archiveState = await queryRunner.query(`
      SELECT is_nullable
        FROM information_schema.columns
       WHERE table_name = 'archived_player_competition_stats'
         AND column_name = 'league_id'
    `);
    if (
      !(archiveState.length > 0 && archiveState[0].is_nullable === 'YES')
    ) {
      await queryRunner.query(`
        ALTER TABLE "archived_player_competition_stats"
          ALTER COLUMN "league_id" DROP NOT NULL
      `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Reversing this requires a backfill: any row with league_id IS NULL
    // would break the NOT NULL constraint. Bail out with a clear message
    // rather than silently corrupting the data. Check BOTH tables since
    // the up() touches both.
    const nullCounts = await queryRunner.query(`
      SELECT
        (SELECT COUNT(*)::int FROM "player_competition_stats"
          WHERE "league_id" IS NULL) AS live_n,
        (SELECT COUNT(*)::int FROM "archived_player_competition_stats"
          WHERE "league_id" IS NULL) AS archive_n
    `);
    const live = nullCounts[0].live_n;
    const archive = nullCounts[0].archive_n;
    if (live > 0 || archive > 0) {
      throw new Error(
        `Cannot revert: live=${live} archive=${archive} row(s) have ` +
          `league_id = NULL. Backfill or delete them before rolling back ` +
          `this migration.`,
      );
    }
    await queryRunner.query(`
      ALTER TABLE "player_competition_stats"
        ALTER COLUMN "league_id" SET NOT NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "archived_player_competition_stats"
        ALTER COLUMN "league_id" SET NOT NULL
    `);
  }
}
