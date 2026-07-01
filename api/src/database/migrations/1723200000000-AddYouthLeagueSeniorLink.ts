import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Add `senior_league_id` FK to `youth_league` so the bootstrap can
 * deterministically link 1 youth_league ↔ 1 senior_league (one-to-one).
 *
 * Nullable for now to keep the migration backwards-compatible with any
 * pre-existing `youth_league` rows; the new
 * `YouthStructureGenerator` backfills the column right after it runs.
 */
export class AddYouthLeagueSeniorLink1723200000000
  implements MigrationInterface
{
  name = 'AddYouthLeagueSeniorLink1723200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "youth_league"
        ADD COLUMN IF NOT EXISTS "senior_league_id" uuid NULL
    `);
    // Best-effort backfill: pair each youth_league with the senior
    // league whose (tier, tier_division) tuple matches the most common
    // mapping. The `parent_tier` is the senior tier, so we group by it
    // and assign the first senior_league per tier. The bootstrap
    // generator will overwrite/normalize these mappings on the next
    // service start.
    await queryRunner.query(`
      UPDATE "youth_league" yl
        SET "senior_league_id" = sub.id
      FROM (
        SELECT DISTINCT ON (yl2.id) yl2.id AS yl_id, sl.id
          FROM "youth_league" yl2
          JOIN "league" sl
            ON sl.tier = yl2.parent_tier
         ORDER BY yl2.id, sl.tier_division
      ) AS sub
      WHERE yl.id = sub.yl_id
        AND yl."senior_league_id" IS NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "youth_league" DROP COLUMN IF EXISTS "senior_league_id"
    `);
  }
}
