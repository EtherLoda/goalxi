/**
 * Tripwire spec for migration
 * 1788000000010-AddMatchEventClockSeconds.
 *
 * The TS-level half of the "in-game clock" change landed
 * in commit (this PR): the engine now stamps every
 * `MatchEvent` with `clockSeconds` and the
 * `MatchEventEntity` declares a nullable
 * `clock_seconds INT NULL` column. This migration is the
 * DB-level half. The settlement processor writes
 * `clockSeconds` for every event it persists; old rows
 * pre-this-migration are NULL and the FE falls back to
 * `minute * 60 + second`.
 *
 * Pure unit — no DB connection. Source-greps the migration
 * file to enforce:
 *   1. up() adds the `clock_seconds` column as nullable
 *   2. down() drops the column
 *   3. The column type is INT (matches the TS type
 *      `number` in `MatchEventEntity.clockSeconds`)
 *   4. The migration name + class name follow project
 *      convention (matches the
 *      `1788000000010-...ts` filename)
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('1788000000010-AddMatchEventClockSeconds migration', () => {
  const source = readFileSync(
    join(__dirname, '1788000000010-AddMatchEventClockSeconds.ts'),
    'utf8',
  );

  describe('up() — adds nullable clock_seconds column', () => {
    it('adds the column on match_event', () => {
      // Pin the SQL shape so a future "let me put this
      // on a different table" rewrite (or any other
      // ALTER on the wrong target) fails the test.
      expect(source).toMatch(
        /ALTER TABLE "match_event"\s+ADD COLUMN "clock_seconds" INT NULL DEFAULT NULL/i,
      );
    });

    it('does NOT add a NOT NULL constraint', () => {
      // Rows persisted before this migration have no
      // clock_seconds value; a NOT NULL would block any
      // backfill path and break pre-deploy replays.
      expect(source).not.toMatch(/ADD COLUMN "clock_seconds"[^"]*NOT NULL/i);
    });

    it('does NOT add a database index', () => {
      // The (matchId, phase, minute) index already serves
      // the FE timeline. Adding a redundant
      // (matchId, clock_seconds) index would bloat writes
      // for every event the processor inserts.
      expect(source).not.toMatch(/CREATE[^"]*INDEX[^"]*clock_seconds/i);
      expect(source).not.toMatch(/clock_seconds[^"]*USING/i);
    });
  });

  describe('down() — drops the column', () => {
    it('drops the clock_seconds column', () => {
      expect(source).toMatch(
        /ALTER TABLE "match_event" DROP COLUMN "clock_seconds"/i,
      );
    });
  });

  describe('naming convention', () => {
    it('class name follows the `<Description><Timestamp>` project convention', () => {
      // The data-source.ts migration loader uses the
      // `name` field, not the class name, to track
      // applied migrations. Both must be present and
      // timestamp-suffixed.
      expect(source).toMatch(/class\s+AddMatchEventClockSeconds1788000000010/);
      expect(source).toMatch(
        /name\s*=\s*['"]AddMatchEventClockSeconds1788000000010['"]/,
      );
    });
  });
});
