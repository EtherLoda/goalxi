import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Team-match `tackles` and `interceptions`.
 *
 * ## Why they are columns and not event-derived
 *
 * Both counters used to be computed in `stats.service.ts` by filtering the
 * event stream for `TACKLE` and `INTERCEPTION` typeNames. Neither string is
 * ever emitted by the engine — they are legacy enum members — so both numbers
 * were permanently 0. The engine now keeps real per-side counters in
 * `getMatchStats().teamCounters`, and `simulation.processor.ts` splits them
 * onto the two rows here.
 *
 * ## Semantics
 *
 * - `tackles` — a push duel the attacking side lost, ball won by the defender.
 * - `interceptions` — the pre-push interception gate fired: possession flipped
 *   AND the new holder gets the counter-attack bonus.
 *
 * They are deliberately separate: only an interception shortens the defensive
 * line's distance to goal.
 *
 * ## Idempotency
 *
 * `ADD COLUMN IF NOT EXISTS` with a `NOT NULL DEFAULT 0`, so a re-run is
 * harmless and existing rows read 0 (which is what they reported before).
 */
export class AddTeamStatsTacklesInterceptions1788000000100
  implements MigrationInterface
{
  name = 'AddTeamStatsTacklesInterceptions1788000000100';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "match_team_stats"
        ADD COLUMN IF NOT EXISTS "tackles" integer NOT NULL DEFAULT 0
    `);
    await queryRunner.query(`
      ALTER TABLE "match_team_stats"
        ADD COLUMN IF NOT EXISTS "interceptions" integer NOT NULL DEFAULT 0
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "match_team_stats" DROP COLUMN IF EXISTS "interceptions"`,
    );
    await queryRunner.query(
      `ALTER TABLE "match_team_stats" DROP COLUMN IF EXISTS "tackles"`,
    );
  }
}
