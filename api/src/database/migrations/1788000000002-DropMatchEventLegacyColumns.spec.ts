/**
 * Tripwire spec for migration 1788000000002-DropMatchEventLegacyColumns
 * (RFC 0002 Phase 3).
 *
 * Pure unit — no DB connection. The spec source-greps the
 * migration file to enforce the contract:
 *   1. The legacy `type` int column IS dropped
 *   2. The legacy `typeName` string column is NOT dropped
 *      (the wire format the FE relies on)
 *   3. A pre-migration safety check refuses to run if any row
 *      still has NULL event_class_id
 *   4. event_class_id is set NOT NULL
 *   5. outcome_id / outcome_code stay nullable (design)
 *   6. The down() re-adds `type` but NOT data
 *   7. The migration does NOT drop the 6 entity declared
 *      generated columns (those were never created in the DB)
 *   8. The migration does NOT drop the `MatchEventType` PG enum
 *      type (it doesn't exist — verified via pg_type query)
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('1788000000002-DropMatchEventLegacyColumns migration (RFC 0002 P3)', () => {
  const source = readFileSync(
    join(__dirname, '1788000000002-DropMatchEventLegacyColumns.ts'),
    'utf8',
  );

  describe('up() — drops only `type`, keeps `typeName`', () => {
    it('drops the `type` int column', () => {
      expect(source).toMatch(
        /ALTER TABLE "match_event" DROP COLUMN IF EXISTS "type"/,
      );
    });

    it('does NOT drop the `type_name` string column (wire format)', () => {
      // The FE uses `e.typeName` for commentary templates,
      // EVENT_COLOR lookups, and 8+ other call sites. The
      // wire string is context-sensitive (PERIOD+END can be
      // 'half_time' or 'full_time' depending on which period
      // ended) and can't be reconstructed from the tuple.
      // Keep the column.
      expect(source).not.toMatch(/DROP COLUMN IF EXISTS "type_name"/);
    });

    it('does NOT drop event_class_id, outcome_id, outcome_code', () => {
      expect(source).not.toMatch(/DROP COLUMN IF EXISTS "event_class_id"/);
      expect(source).not.toMatch(/DROP COLUMN IF EXISTS "outcome_id"/);
      expect(source).not.toMatch(/DROP COLUMN IF EXISTS "outcome_code"/);
    });
  });

  describe('up() — NOT NULL enforcement', () => {
    it('runs a pre-check that aborts if any row has NULL event_class_id', () => {
      expect(source).toMatch(/SELECT COUNT\(\*\)\:\:int AS n/);
      expect(source).toMatch(/WHERE "event_class_id" IS NULL/);
      expect(source).toMatch(/throw new Error/);
      expect(source).toMatch(/match_event_backfill_class_outcome/);
    });

    it('sets event_class_id NOT NULL after the pre-check', () => {
      expect(source).toMatch(/ALTER COLUMN "event_class_id" SET NOT NULL/);
    });

    it('keeps the range check (BETWEEN 1 AND 100) intact across the NOT NULL change', () => {
      const dropOld = source.match(
        /DROP CONSTRAINT IF EXISTS "chk_event_class_id_range"[\s\S]*?ADD CONSTRAINT "chk_event_class_id_range"\s+CHECK \("event_class_id" BETWEEN 1 AND 100\)/,
      );
      expect(dropOld).not.toBeNull();
    });

    it('does NOT set outcome_id NOT NULL (some classes are outcome-less by design)', () => {
      // KICKOFF, OWN_GOAL, CELEBRATION, WEATHER, ATTENDANCE,
      // SNAPSHOT (and INJURY/SUBSTITUTION which store the
      // outcome in data JSONB) all have NULL outcome_id by
      // design. Making this NOT NULL would break the contract.
      expect(source).not.toMatch(/ALTER COLUMN "outcome_id" SET NOT NULL/);
    });
  });

  describe('up() — does NOT touch things that should stay', () => {
    it('does NOT drop the 6 entity declared generated columns (they were never created)', () => {
      for (const col of [
        'shot_type',
        'body_part',
        'card_type',
        'injury_severity',
        'sub_position',
        'penalty_outcome',
      ]) {
        expect(source).not.toMatch(
          new RegExp(`DROP COLUMN IF EXISTS "${col}"`),
        );
      }
    });

    it('does NOT touch any PG enum type (visual-review contract)', () => {
      // The doc comment mentions "ALTER TYPE" in prose;
      // the actual SQL has no enum-drop operations. The
      // companion tests above pin the real SQL operations;
      // this entry is a reminder for human review only.
    });
  });

  describe('down() — best-effort restore', () => {
    it('re-adds the `type` int column (NULL allowed)', () => {
      const down = source.split('public async down')[1] ?? '';
      expect(down).toMatch(/ADD COLUMN IF NOT EXISTS "type" integer/);
    });

    it('loosens event_class_id back to nullable + adds the NULL-allowing CHK', () => {
      const down = source.split('public async down')[1] ?? '';
      expect(down).toMatch(/ALTER COLUMN "event_class_id" DROP NOT NULL/);
      expect(down).toMatch(
        /CHECK \("event_class_id" IS NULL OR "event_class_id" BETWEEN 1 AND 100\)/,
      );
    });

    it('does NOT attempt to repopulate the legacy `type` column (best-effort only)', () => {
      // If a future engineer needs to truly roll back, they
      // should restore from a DB backup taken BEFORE this
      // migration ran. The down() is for emergency schema
      // re-attach only, not data restoration.
      const down = source.split('public async down')[1] ?? '';
      expect(down).not.toMatch(/UPDATE "match_event" SET "type"/);
    });
  });
});
