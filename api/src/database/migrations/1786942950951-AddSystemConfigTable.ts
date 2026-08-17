import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds the `system_config` table — a tiny key-value store
 * used by the init script to persist cross-process anchors
 * (currently just `init_date`, the calendar day the first
 * `pnpm init:run` was executed on).
 *
 * Why a table and not just an env var:
 *   - env vars drift between deploys / replicas. A restart
 *     that loses `GAME_START_DATE` would silently re-anchor
 *     the season to "today", which the match scheduler
 *     would then treat as a fresh week boundary.
 *   - The settlement service already reads `GAME_START_DATE`
 *     via `resolveGameStart()` in
 *     `libs/database/src/utils/game-clock.ts`. After this
 *     migration, the CLI/init flow writes the chosen date
 *     here so a subsequent read falls back to the DB rather
 *     than "today" when the env is unset.
 *
 * Shape:
 *   - `key` varchar(64) PRIMARY KEY — the config key
 *     (e.g. `init_date`).
 *   - `value` varchar(256) — the value. Dates are stored as
 *     `YYYY-MM-DD`. Sized to fit a small JSON blob if we
 *     ever need it (e.g. {season, week}).
 *   - `created_at` / `updated_at` — inherited from
 *     `AbstractEntity`. We deliberately do not use
 *     `synchronize: true` (this is the project default) so
 *     any schema change to this table needs a follow-up
 *     migration.
 */
export class AddSystemConfigTable1786942950951 implements MigrationInterface {
  name = 'AddSystemConfigTable1786942950951';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "system_config" (
        "key" varchar(64) PRIMARY KEY,
        "value" varchar(256) NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updated_at" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "system_config"`);
  }
}
