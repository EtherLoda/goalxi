import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds `lineup_broadcast_at` and `match_end_broadcast_at` (timestamptz, nullable)
 * to the `match` table so `MatchLiveScheduler` can tell whether it has already
 * broadcast a given match's lineup / match_end event.
 *
 * Background (B4 + B5 from the live page review):
 *   - `processLineupBroadcasts` runs every 30s and currently re-broadcasts
 *     `lineup_update` to every subscribed client as long as the match is in
 *     the 5-min pre-kickoff window. Lasts up to 5 minutes × 2 ticks / minute
 *     = 10 redundant broadcasts per match, each of which causes the client
 *     to overwrite its in-memory lineup.
 *   - `processMatchCompletions` runs every 10s and currently re-broadcasts
 *     `match_end` for every `COMPLETED` match forever (and for every
 *     `IN_PROGRESS + actualEndTime <= now` match in the 10s window). The
 *     client hooks respond by re-running `setMode('report')` and resetting
 *     `matchState` home/away score, which causes UI flicker.
 *
 * The marker columns are nullable timestamptz on the `match` row (not on
 * the event) because:
 *   - the broadcast is a property of the fixture lifecycle, not of any
 *     particular event (we broadcast a *summary* of the lineup / end state);
 *   - it lets the next season's matches start with `null` (fresh) without
 *     resetting anything else;
 *   - the scheduler's `WHERE ... IS NULL` clause is a one-line filter and
 *     keeps the in-memory broadcasted set empty (so multi-instance deploys
 *     don't double-broadcast either).
 *
 * Nullable + no default → existing rows are treated as "not yet
 * broadcast", so the columns are safe to backfill on a production
 * database that already has completed matches in the table.
 */
export class AddMatchBroadcastTimestamps1728200000000 implements MigrationInterface {
  name = 'AddMatchBroadcastTimestamps1728200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "match"
      ADD COLUMN IF NOT EXISTS "lineup_broadcast_at" timestamptz NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "match"
      ADD COLUMN IF NOT EXISTS "match_end_broadcast_at" timestamptz NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "match" DROP COLUMN IF EXISTS "lineup_broadcast_at"
    `);
    await queryRunner.query(`
      ALTER TABLE "match" DROP COLUMN IF EXISTS "match_end_broadcast_at"
    `);
  }
}
