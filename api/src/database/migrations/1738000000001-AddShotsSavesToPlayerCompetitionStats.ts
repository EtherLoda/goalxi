import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Add `shots` and `saves` to `player_competition_stats` and its
 * archive mirror. The engine tracks these per-player in
 * `playerMatchStats` (match.engine.ts playerMatchStats Map) but
 * they were never persisted, so the FE couldn't show a "shots
 * per game" line on the player profile or a "saves per game"
 * line on the GK profile.
 *
 * shots = total shot attempts by this player in the period
 *   (goal / miss / save / blocked outcomes from the engine's
 *   `handleShot`; goal scored, miss off target, save by GK,
 *   block by defender all count as one shot attempt by the
 *   shooter). Penalty shootout kicks are NOT counted - the
 *   engine emits separate `penalty_goal` / `penalty_miss`
 *   events with minute=120 and they're a different stat.
 *
 * saves = total saves by this player. Only `save` outcomes
 *   count, and they're credited to the defending team's GK
 *   (engine resolves the GK via `defendingTeam.getGoalkeeper()`).
 *   Outfield players never get a save.
 *
 * Defaults 0 are populated by the entity's `default: 0`, so
 * existing rows pick up 0 / 0 without a backfill.
 *
 * Idempotent: ADD COLUMN IF NOT EXISTS on each table
 * (PG 9.6+).
 */
export class AddShotsSavesToPlayerCompetitionStats1738000000001
  implements MigrationInterface
{
  name = 'AddShotsSavesToPlayerCompetitionStats1738000000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "player_competition_stats"
      ADD COLUMN IF NOT EXISTS "shots" integer NOT NULL DEFAULT 0
    `);
    await queryRunner.query(`
      ALTER TABLE "player_competition_stats"
      ADD COLUMN IF NOT EXISTS "saves" integer NOT NULL DEFAULT 0
    `);
    await queryRunner.query(`
      ALTER TABLE "archived_player_competition_stats"
      ADD COLUMN IF NOT EXISTS "shots" integer NOT NULL DEFAULT 0
    `);
    await queryRunner.query(`
      ALTER TABLE "archived_player_competition_stats"
      ADD COLUMN IF NOT EXISTS "saves" integer NOT NULL DEFAULT 0
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "player_competition_stats" DROP COLUMN IF EXISTS "saves"`,
    );
    await queryRunner.query(
      `ALTER TABLE "player_competition_stats" DROP COLUMN IF EXISTS "shots"`,
    );
    await queryRunner.query(
      `ALTER TABLE "archived_player_competition_stats" DROP COLUMN IF EXISTS "saves"`,
    );
    await queryRunner.query(
      `ALTER TABLE "archived_player_competition_stats" DROP COLUMN IF EXISTS "shots"`,
    );
  }
}
