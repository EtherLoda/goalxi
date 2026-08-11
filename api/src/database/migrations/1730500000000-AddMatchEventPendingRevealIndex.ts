import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Partial index covering the live scheduler's hot-path read:
 *
 *   SELECT … FROM match_event
 *   WHERE is_revealed = false
 *     AND event_scheduled_time <= $now
 *
 * `MatchLiveScheduler.processRevealableEvents` runs every 5s and used
 * the full `(matchId, event_scheduled_time)` composite index plus a
 * `is_revealed = false` filter as a post-scan predicate. With ~50
 * events per match and a partial that has 1 of 2 flags flipped (the
 * `is_revealed = true` half is the historical state that won't be
 * scanned again), a *partial* index on `event_scheduled_time` filtered
 * to `is_revealed = false` is the right shape:
 *
 *   - smaller: only the unrevealed half of the table is indexed, which
 *     shrinks as matches complete. After a matchday weekend the index
 *     can drop to ~5% of its original size until the next kickoff.
 *   - faster: the planner doesn't have to re-check the `is_revealed`
 *     predicate after the index lookup, and the small size keeps it
 *     hot in cache.
 *   - one index, not two: we deliberately do NOT add a `(is_revealed,
 *     event_scheduled_time)` full index because that one would carry
 *     the dead half of the table forever.
 *
 * `CREATE INDEX CONCURRENTLY` so the build doesn't block writes on a
 * live `match_event` table (sim workers are constantly appending to it
 * during matchday weekends). For `CONCURRENTLY` to be allowed we have
 * to opt the migration out of the surrounding transaction — that's
 * the `transaction = false` line below. Without it, the index build
 * would fail with `CREATE INDEX CONCURRENTLY cannot run inside a
 * transaction block`.
 *
 * `IF NOT EXISTS` makes the migration idempotent so a re-run after a
 * partial failure (e.g. CONCURRENTLY can take a long time on a large
 * table and be killed by a maintenance window) is safe.
 */
export class AddMatchEventPendingRevealIndex1730500000000 implements MigrationInterface {
  name = 'AddMatchEventPendingRevealIndex1730500000000';

  // Opt out of the wrapping transaction so CREATE INDEX CONCURRENTLY
  // is legal. See file header for why.
  public transaction = false;

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_match_event_pending_reveal"
      ON "match_event" ("event_scheduled_time")
      WHERE "is_revealed" = false
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX CONCURRENTLY IF EXISTS "idx_match_event_pending_reveal"
    `);
  }
}
