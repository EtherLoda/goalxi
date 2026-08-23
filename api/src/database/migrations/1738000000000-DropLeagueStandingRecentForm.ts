import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Drop the unused `league_standing.recent_form` column.
 *
 * Why: the column was added in the initial schema with the intent
 * of holding a rolling 5-match result string like "WWDLW", but no
 * code ever wrote it. The DTO path (api/src/api/league/league.service.ts
 * getStandings) computes the equivalent `recentMatches` list on
 * demand from `MatchEntity` rows, so the column was strictly dead
 * weight. A full-repo grep for `standing.recentForm` /
 * `recent_form` returns zero writers and zero readers outside the
 * entity itself.
 *
 * Note: this is unrelated to `FanEntity.recentForm`, which IS
 * maintained and rendered on the dashboard (fan morale, not match
 * form). Different table, different column, different meaning.
 *
 * Idempotent: `DROP COLUMN IF EXISTS` makes the up() safe to re-run
 * on a partially-migrated DB. The down() recreates the column with
 * the original shape (varchar(10) NOT NULL DEFAULT '') so a
 * rollback is non-destructive.
 */
export class DropLeagueStandingRecentForm1738000000000
  implements MigrationInterface
{
  name = 'DropLeagueStandingRecentForm1738000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "league_standing" DROP COLUMN IF EXISTS "recent_form"
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "league_standing"
      ADD COLUMN IF NOT EXISTS "recent_form" varchar(10) NOT NULL DEFAULT ''
    `);
  }
}
