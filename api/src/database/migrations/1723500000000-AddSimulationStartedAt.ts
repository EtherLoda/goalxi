import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds `simulation_started_at` to `match` so the SimulationProcessor can
 * claim a per-match atomic lock before running the engine.
 *
 * Why: the worker used to only guard against `status=COMPLETED`, leaving a
 * window where the recovery branch in `completeMatches` (settlement scheduler)
 * re-enqueued simulation jobs while a previous worker was still running.
 * The first worker never sets status=COMPLETED itself (it expects the scheduler
 * to do that once `lastEvent.eventScheduledTime <= now`), so two workers would
 * both pass the guard, run the engine concurrently, and bulk-insert events
 * for the same match — producing 4× snapshots per minute in `match_event`.
 *
 * The lock flow:
 *   1. Worker atomically claims via
 *      `UPDATE match SET simulation_started_at = NOW()
 *        WHERE id=? AND simulation_started_at IS NULL
 *          AND status IN ('tactics_locked','in_progress') RETURNING id`
 *      — second worker hits 0 rows affected and bails out before writing events.
 *   2. try/finally releases the lock on success OR crash.
 *   3. `completeMatches` clears stale locks older than 1h so a crashed worker
 *      doesn't permanently block retries.
 */
export class AddSimulationStartedAt1723500000000 implements MigrationInterface {
  name = 'AddSimulationStartedAt1723500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "match"
      ADD COLUMN "simulation_started_at" TIMESTAMP WITH TIME ZONE NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "match"
      DROP COLUMN "simulation_started_at"
    `);
  }
}