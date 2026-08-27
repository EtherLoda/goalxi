import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Add `match_event.clock_seconds` — the in-game clock at the
 * moment each event was emitted, expressed as seconds from
 * the 1H kickoff (0 = 0'0", 2700 = 45'0", 5400 = 90'0",
 * 6300 = 105'0", 7200 = 120'0").
 *
 * ## Why
 *
 * The engine's simulation tick is per-half — 1H ticks 1..45
 * map to in-game 1..45, but 2H ticks 46..90 map to in-game
 * 45..89. The 2H kickoff is at in-game 45'0" but engine
 * `minute: 46`; the 1H whistle (when there's no stoppage)
 * is at engine `minute: 45`. With the legacy `minute` field
 * alone, the 1H whistle and the 2H kickoff look like two
 * adjacent minutes (45 and 46) instead of two events at
 * the same in-game instant (45'0"). The FE needs the
 * in-game clock to render the timeline correctly and to
 * disambiguate boundary events.
 *
 * `clock_seconds` is nullable + default NULL on purpose:
 * rows persisted before this migration have no value here
 * and the FE falls back to `minute * 60 + second` so the
 * wire is still functional. Backfill is deferred — the
 * settlement processor writes the new field for every
 * event it persists going forward, so the column will
 * populate naturally for all matches simulated post-deploy.
 *
 * ## Schema
 *
 *   - column: `match_event.clock_seconds INT NULL DEFAULT NULL`
 *   - index: not added. The existing
 *     `(matchId, phase, minute)` index continues to serve
 *     the FE timeline queries; `clockSeconds` is a derived
 *     display value, not a sort key the backend reads.
 *
 * ## Why no `NOT NULL` constraint
 *
 * The processor may write `clockSeconds` for every event
 * going forward, but rows from old inits / pre-deploy
 * re-runs (e.g. admin-initiated replays of historical
 * matches) will land without a value. A `NOT NULL` would
 * break those paths; `nullable: true` + the FE fallback
 * keeps the door open.
 */
export class AddMatchEventClockSeconds1788000000010
  implements MigrationInterface
{
  name = 'AddMatchEventClockSeconds1788000000010';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "match_event"
      ADD COLUMN "clock_seconds" INT NULL DEFAULT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "match_event" DROP COLUMN "clock_seconds"
    `);
  }
}
