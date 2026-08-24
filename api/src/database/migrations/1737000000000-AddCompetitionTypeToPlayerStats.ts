import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Add `competition_type` to player_competition_stats and its
 * archive table.
 *
 * Why: the previous nullable-leagueId migration
 * (1736000000000) let cup / youth / friendly / national-team
 * matches land in the same table, but the only discriminator
 * was "leagueId IS NULL", which conflates every non-league
 * competition into one bucket. The FE has to filter by hand
 * to render a "league vs cup" split, and we can't add a new
 * non-league type (e.g. friendly) without breaking the
 * inference.
 *
 * The new column explicitly tags each row as one of:
 *   - 'LEAGUE'  - senior league / playoff match (leagueId set,
 *                 youthLeagueId null)
 *   - 'CUP'     - cup match (leagueId null, match.type='cup')
 *   - 'YOUTH'   - youth academy match (youthLeagueId set)
 *   - 'OTHER'   - reserved for future types (TOURNAMENT,
 *                 FRIENDLY, NATIONAL_TEAM) that the enum
 *                 allows but no scheduler generates today
 *
 * Backfill: any existing row with `league_id IS NULL` is
 * tagged 'CUP' because every non-league match in prod is
 * currently a cup. When friendly/national get implemented,
 * they should re-derive the column at write time (the
 * simulator writes it on every match, see
 * `updatePlayerCompetitionStats` in the simulator); no
 * further backfill is needed.
 *
 * Idempotency: information_schema check on the column. The
 * CHECK constraint and the backfill UPDATE both short-circuit
 * on a re-run.
 */
export class AddCompetitionTypeToPlayerStats1737000000000
  implements MigrationInterface
{
  name = 'AddCompetitionTypeToPlayerStats1737000000000';

  private readonly ALLOWED_VALUES = ["'LEAGUE'", "'CUP'", "'YOUTH'", "'OTHER'"];

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Live table
    await this.addColumn(queryRunner, 'player_competition_stats');
    // 2. Archive table (mirrors the live schema for the
    // season-archive service copy)
    await this.addColumn(queryRunner, 'archived_player_competition_stats');
  }

  private async addColumn(
    queryRunner: QueryRunner,
    table: string,
  ): Promise<void> {
    const hasColumn = await queryRunner.query(`
      SELECT 1
        FROM information_schema.columns
       WHERE table_name = $1
         AND column_name = 'competition_type'
    `, [table]);
    if (hasColumn.length > 0) {
      return; // already added
    }

    await queryRunner.query(`
      ALTER TABLE "${table}"
        ADD COLUMN "competition_type" varchar(20) NOT NULL
          DEFAULT 'LEAGUE'
    `);

    // Backfill: rows with null league_id are non-league; in
    // production today every non-league match is a cup, so
    // 'CUP' is the right backfill. Future writes (simulator)
    // override this with the real match.type.
    await queryRunner.query(`
      UPDATE "${table}"
         SET "competition_type" = 'CUP'
       WHERE "league_id" IS NULL
    `);

    // CHECK constraint to keep the column honest at the DB
    // level. If a future code path writes a value outside this
    // set, the INSERT/UPDATE fails loudly rather than silently
    // misclassifying the row.
    const constraintName = `${table}_competition_type_check`;
    await queryRunner.query(`
      ALTER TABLE "${table}"
        ADD CONSTRAINT "${constraintName}"
        CHECK ("competition_type" IN (${this.ALLOWED_VALUES.join(', ')}))
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop is symmetric; we don't bother back-converting because
    // the column is purely additive (a derived label, not
    // something other tables join on).
    for (const table of [
      'player_competition_stats',
      'archived_player_competition_stats',
    ]) {
      await queryRunner.query(`
        ALTER TABLE "${table}"
          DROP CONSTRAINT IF EXISTS "${table}_competition_type_check"
      `);
      await queryRunner.query(`
        ALTER TABLE "${table}"
          DROP COLUMN IF EXISTS "competition_type"
      `);
    }
  }
}
