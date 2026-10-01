import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds `settled_at` (timestamptz, nullable) to the `match` table, plus a
 * partial index for the reconciliation sweep.
 *
 * ## Why
 *
 * `MatchStatus.COMPLETED` currently doubles as two different facts:
 *
 *   1. "the simulator finished and the scheduler finalised the status"
 *   2. "the post-match settlement ran"
 *
 * Only (1) is recorded in the database. (2) lives exclusively in a Redis
 * key (`MatchCacheService.isMatchProcessed`, **24h TTL**), so:
 *
 *  - there is no durable, queryable settlement receipt anywhere;
 *  - `MatchSchedulerService.completeMatches` scans only
 *    `IN_PROGRESS` and `TACTICS_LOCKED + simulationCompletedAt NOT NULL`,
 *    so once the CAS flips a row to COMPLETED the row is permanently
 *    invisible to the scheduler;
 *  - the CAS and the `queue.add` are two separate statements, so a crash
 *    between them leaves a COMPLETED-but-unsettled match that NOTHING can
 *    recover: a manual re-add is a silent BullMQ no-op because
 *    `jobId: complete-${match.id}` still exists in Redis and no
 *    `removeOnComplete` is set on that queue;
 *  - after 24h the Redis key expires, so any late duplicate delivery
 *    re-applies standings / ELO / minutes / fan / ticket revenue.
 *
 * `settled_at` makes (2) a durable fact and gives the scheduler a query
 * to sweep.
 *
 * ## Why nullable, no default
 *
 * Existing rows read as "not yet settled". For a database that has already
 * been running, that means the first sweep after deploy would try to
 * re-settle every historical match. That is *safe* — the re-settlement is
 * idempotent by construction once `settled_at` is written before the
 * revenue/stat writes are trusted on the next pass — but it is wasteful,
 * so the migration below backfills the rows we can prove were already
 * settled.
 *
 * ## Backfill
 *
 * A row is considered already settled if it has a `completed_at` older
 * than the deployment. This is a heuristic, and the conservative
 * alternative (leaving everything null) means re-settling all of history
 * once. Chosen: backfill matches that completed before the migration ran,
 * and leave anything completed within the last day alone so in-flight
 * rows still go through the sweep.
 */
export class AddMatchSettledAt1788000000030 implements MigrationInterface {
  name = 'AddMatchSettledAt1788000000030';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "match"
      ADD COLUMN IF NOT EXISTS "settled_at" timestamptz
    `);

    // Partial index: the sweep queries
    // `WHERE status = 'completed' AND settled_at IS NULL`, so only the
    // unsettled rows need to be indexed. As the sweep fills them in the
    // index shrinks, which is the desired steady state.
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_match_unsettled"
      ON "match" ("completed_at")
      WHERE "settled_at" IS NULL AND "status" = 'completed'
    `);

    // Backfill rows that finished well before this migration ran. The
    // 1-day cutoff keeps recent matches on the sweep path so anything
    // genuinely missed while the old code was in charge still gets
    // picked up.
    await queryRunner.query(`
      UPDATE "match"
      SET "settled_at" = "completed_at"
      WHERE "settled_at" IS NULL
        AND "status" = 'completed'
        AND "completed_at" IS NOT NULL
        AND "completed_at" < NOW() - INTERVAL '1 day'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_match_unsettled"`);
    await queryRunner.query(
      `ALTER TABLE "match" DROP COLUMN IF EXISTS "settled_at"`,
    );
  }
}
