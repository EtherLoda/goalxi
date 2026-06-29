import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Add `match.stadium_id` (nullable uuid FK) so matches record their venue.
 *
 * Why nullable:
 *  - Historical rows pre-date the column and we want a safe no-op backfill
 *    rather than force-updating every past match.
 *  - Neutral-venue / future-virtual-stadium matches have no team-owned
 *    stadium to point at.
 *
 * Backfill: any pre-existing match is bound to its home team's stadium
 * (each team currently owns one Stadium row). If the home team has no
 * stadium, the row stays NULL — the match.attendance field will fall back
 * to a synthetic estimate downstream.
 *
 * CASCADE on team/stadium delete is intentionally NOT used: deleting a
 * team should not silently invalidate historical match records. Stadium
 * deletion is treated the same way.
 */
export class AddMatchStadiumId1721000000001 implements MigrationInterface {
  name = 'AddMatchStadiumId1721000000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Add the column (nullable for safe backfill).
    await queryRunner.query(
      `ALTER TABLE "match" ADD COLUMN "stadium_id" uuid`,
    );

    // 2. Backfill: copy the home team's stadium id where it exists.
    await queryRunner.query(`
      UPDATE "match" m
      SET stadium_id = s.id
      FROM "stadium" s
      WHERE s.team_id = m.home_team_id
        AND m.stadium_id IS NULL
    `);

    // 3. FK constraint (nullable, ON DELETE SET NULL — historic matches
    //    survive team/stadium deletion by leaving venue unknown).
    await queryRunner.query(`
      ALTER TABLE "match"
      ADD CONSTRAINT "FK_match_stadium_id"
      FOREIGN KEY ("stadium_id") REFERENCES "stadium"("id")
      ON DELETE SET NULL
    `);

    // 4. Index for the common "matches at this stadium" query.
    await queryRunner.query(
      `CREATE INDEX "IDX_match_stadium_id" ON "match" ("stadium_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_match_stadium_id"`);
    await queryRunner.query(
      `ALTER TABLE "match" DROP CONSTRAINT IF EXISTS "FK_match_stadium_id"`,
    );
    await queryRunner.query(`ALTER TABLE "match" DROP COLUMN "stadium_id"`);
  }
}