import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Add `minutes` to `player_competition_stats` and its archive
 * mirror.
 *
 * Why: the engine tracks per-player `minutesPlayed` in
 * `playerMatchStats` (already in the same shape as goals /
 * assists / tackles / shots / saves) but it was never persisted
 * to the season-level stats table. `PlayerEntity.matchMinutes`
 * is a different concept - it's the condition-update accumulator
 * that the settlement `condition.processor` reads to compute
 * form / stamina and then zeroes out, so it's not a reliable
 * season total.
 *
 * The new column is a non-resetting running total: it survives
 * the condition.processor zeroing (because it lives in
 * `PlayerCompetitionStatsEntity`, not on `PlayerEntity`) and
 * survives season archive (the archive mirror carries the same
 * column so the season-end snapshot is complete).
 *
 * Defaults 0 are populated by the entity's `default: 0`, so
 * existing rows pick up 0 without a backfill. Historical
 * minutes aren't reconstructed - the per-match `match_event` /
 * `MatchTeamStatsEntity` rows are the source of truth for
 * replaying old matches if anyone ever wants to.
 *
 * Idempotent: ADD COLUMN IF NOT EXISTS on each table
 * (PG 9.6+).
 */
export class AddMinutesToPlayerCompetitionStats1738000000002 implements MigrationInterface {
  name = 'AddMinutesToPlayerCompetitionStats1738000000002';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "player_competition_stats"
      ADD COLUMN IF NOT EXISTS "minutes" integer NOT NULL DEFAULT 0
    `);
    await queryRunner.query(`
      ALTER TABLE "archived_player_competition_stats"
      ADD COLUMN IF NOT EXISTS "minutes" integer NOT NULL DEFAULT 0
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "player_competition_stats" DROP COLUMN IF EXISTS "minutes"`,
    );
    await queryRunner.query(
      `ALTER TABLE "archived_player_competition_stats" DROP COLUMN IF EXISTS "minutes"`,
    );
  }
}
