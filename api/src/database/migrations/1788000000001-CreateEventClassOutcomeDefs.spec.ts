/**
 * Tripwire spec for migration 1788000000001-CreateEventClassOutcomeDefs
 * (RFC 0002 Phase 1).
 *
 * Pure unit — no DB connection. The spec source-greps the
 * migration file to enforce the contract:
 *   1. Both dictionary tables are created
 *   2. The seed counts are exactly 17 (classes) and 28 (outcomes)
 *   3. The match_event additive columns are present
 *   4. The 4 generated outcome columns are present
 *   5. The 2 partial indexes are present
 *   6. The backfill function is created
 *   7. The legacy `type` int column is NOT dropped (Phase 1 is
 *      additive only — Phase 3 is the destructive drop)
 *   8. The down() is destructive on data (so a `down` in
 *      production is a no-go after consumers start using the
 *      new columns)
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('1788000000001-CreateEventClassOutcomeDefs migration (RFC 0002 P1)', () => {
  const source = readFileSync(
    join(__dirname, '1788000000001-CreateEventClassOutcomeDefs.ts'),
    'utf8',
  );

  describe('up() — dictionary tables', () => {
    it('creates the event_class_def table with PK + UNIQUE(code)', () => {
      expect(source).toMatch(
        /CREATE TABLE IF NOT EXISTS "event_class_def"/,
      );
      expect(source).toMatch(
        /CONSTRAINT "PK_event_class_def" PRIMARY KEY \("id"\)/,
      );
      expect(source).toMatch(
        /CONSTRAINT "UQ_event_class_def_code" UNIQUE \("code"\)/,
      );
    });

    it('creates the event_outcome_def table with PK + UNIQUE(code)', () => {
      expect(source).toMatch(
        /CREATE TABLE IF NOT EXISTS "event_outcome_def"/,
      );
      expect(source).toMatch(
        /CONSTRAINT "PK_event_outcome_def" PRIMARY KEY \("id"\)/,
      );
      expect(source).toMatch(
        /CONSTRAINT "UQ_event_outcome_def_code" UNIQUE \("code"\)/,
      );
    });

    it('seeds exactly 17 event_class_def rows (matches the RFC matrix)', () => {
      // Count the class block rows (the second column is the
      // family string: 'neutral' / 'negative' / 'positive' /
      // 'period'). The outcomes block has BOOLEAN as its 2nd
      // value, so this regex only matches the 17 class rows.
      const classRows =
        source.match(/\(\s*\d+\s*,\s*'[A-Z_]+'\s*,\s*'(?:neutral|negative|positive|period)'/g) ?? [];
      expect(classRows.length).toBe(17);
    });

    it('seeds 28 outcomes', () => {
      // The outcome INSERT block follows the class block. We
      // count rows by anchoring on the outcome's 4th-arg shape
      // (BOOLEAN, BOOLEAN, ...) which is unique to outcomes.
      const outcomeSection =
        source.split('INSERT INTO "event_outcome_def"')[1] ?? '';
      const outcomeRows = outcomeSection.match(
        /^\s*\(\s*\d+\s*,\s*'[A-Z_]+'\s*,\s*(?:TRUE|FALSE)/gm,
      ) ?? [];
      expect(outcomeRows.length).toBe(28);
    });

    it('uses ON CONFLICT (id) DO NOTHING for idempotent re-seed', () => {
      expect(source).toMatch(/ON CONFLICT \("id"\) DO NOTHING/);
    });
  });

  describe('up() — match_event additive columns', () => {
    it('adds the 3 core columns nullable + idempotent', () => {
      expect(source).toMatch(
        /ADD COLUMN IF NOT EXISTS "event_class_id" SMALLINT NULL/,
      );
      expect(source).toMatch(
        /ADD COLUMN IF NOT EXISTS "outcome_id" SMALLINT NULL/,
      );
      expect(source).toMatch(
        /ADD COLUMN IF NOT EXISTS "outcome_code" VARCHAR\(32\) NULL/,
      );
    });

    it('adds the 4 generated outcome columns with STORED', () => {
      // STORED is required because (a) future readers may want
      // to index these, and PG disallows indexing VIRTUAL
      // generated columns; (b) consistency with the RFC 0003
      // generated columns on the same table.
      for (const col of [
        'shot_outcome',
        'foul_outcome',
        'corner_outcome',
        'free_kick_outcome',
      ]) {
        const re = new RegExp(
          `ADD COLUMN IF NOT EXISTS "${col}" VARCHAR\\(16\\)[\\s\\S]*?STORED`,
        );
        expect(source).toMatch(re);
      }
    });

    it('adds 2 partial B-tree indexes', () => {
      expect(source).toMatch(/CREATE INDEX IF NOT EXISTS "idx_event_class_outcome"/);
      expect(source).toMatch(/CREATE INDEX IF NOT EXISTS "idx_player_class_outcome"/);
      // Both must be partial (WHERE NOT NULL) to keep index
      // size in check on the ~10% of events that have a
      // class_id set after backfill.
      expect(source).toMatch(
        /idx_event_class_outcome[\s\S]*?WHERE "event_class_id" IS NOT NULL/,
      );
      expect(source).toMatch(
        /idx_player_class_outcome[\s\S]*?WHERE "player_id" IS NOT NULL/,
      );
    });

    it('adds CHECK constraints (chk_event_class_id_range, chk_outcome_id_range)', () => {
      // Wrapped in a DO block for IF-NOT-EXISTS pattern.
      expect(source).toMatch(/chk_event_class_id_range/);
      expect(source).toMatch(/chk_outcome_id_range/);
      expect(source).toMatch(/BETWEEN 1 AND 100/);
    });
  });

  describe('up() — backfill function', () => {
    it('creates match_event_backfill_class_outcome(p_match_id uuid DEFAULT NULL)', () => {
      expect(source).toMatch(
        /CREATE OR REPLACE FUNCTION "match_event_backfill_class_outcome"/,
      );
      expect(source).toMatch(/"p_match_id" uuid DEFAULT NULL/);
      expect(source).toMatch(/RETURNS integer/);
    });

    it('is idempotent (skips rows that already have event_class_id)', () => {
      // The WHERE clause must include `event_class_id IS NULL`
      // so a re-run doesn't overwrite the Phase 2+ engine's
      // writes.
      expect(source).toMatch(/AND "event_class_id" IS NULL/);
    });

    it('calls the backfill once for all existing rows in the up()', () => {
      // Auto-run on migrate so a fresh production DB doesn't
      // need a separate "backfill" step.
      expect(source).toMatch(/SELECT "match_event_backfill_class_outcome"\(NULL\)/);
    });

    it('maps 5 legacy types to NULL (no class for PASS/TACKLE/INTERCEPTION/CLEARANCE/OFFSIDE)', () => {
      // These 5 will get NULL class_id, leaving them readable
      // only via the legacy `type` int + `typeName` string
      // columns. Phase 2 will decide whether to add classes.
      // We pin the mapping so a future contributor doesn't
      // accidentally assign them to a wrong class.
      const funcSection = source.match(
        /CREATE OR REPLACE FUNCTION[\s\S]*?LANGUAGE plpgsql/,
      )?.[0] ?? '';
      for (const legacyType of [5, 6, 7, 16, 28]) {
        // The CASE branch for that type should map to NULL.
        const re = new RegExp(`WHEN ${legacyType}\\s+THEN NULL`);
        expect(funcSection).toMatch(re);
      }
    });

    it('maps GOAL (type=2) to class SHOT (3) + outcome GOAL (1)', () => {
      // The most important mapping — it powers the "X scored
      // a goal" stat query. Pin the exact ids.
      const funcSection = source.match(
        /CREATE OR REPLACE FUNCTION[\s\S]*?LANGUAGE plpgsql/,
      )?.[0] ?? '';
      expect(funcSection).toMatch(/WHEN 2\s+THEN 3/);
      // And the outcome branch:
      expect(funcSection).toMatch(/WHEN 2\s+THEN 1/);
    });
  });

  describe('Phase 1 contract — additive only', () => {
    it('does NOT drop the legacy `type` int column', () => {
      // Phase 1 is additive. Dropping `type` happens in Phase 3.
      // A premature drop would break every reader that's still
      // on the old code path.
      const downSection =
        source.split('public async down')[1] ?? '';
      expect(downSection).not.toMatch(/DROP COLUMN.*"type"/);
    });

    it('does NOT drop the legacy `typeName` string column', () => {
      const downSection =
        source.split('public async down')[1] ?? '';
      expect(downSection).not.toMatch(/DROP COLUMN.*"typeName"/);
    });

    it('does NOT change the engine or any reader (out of scope)', () => {
      // The migration file is database-only. Any reference to
      // simulator code, app code, or web code means the
      // commit accidentally mixed Phase 1 with Phase 2.
      expect(source).not.toMatch(/match\.engine\.ts/);
      expect(source).not.toMatch(/simulation\.processor/);
      expect(source).not.toMatch(/extract-key-events/);
    });
  });
});
