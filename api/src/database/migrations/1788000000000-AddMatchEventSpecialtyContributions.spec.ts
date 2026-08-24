/**
 * Tripwire spec for migration 1788000000000-AddMatchEventSpecialtyContributions.
 *
 * Pure unit — no DB connection — just confirms the migration file's
 * intent by reading the file content. Catches accidental removal of:
 *   - The `IF NOT EXISTS` guards (would crash on a re-run)
 *   - The `STORED` keyword on generated columns (would break
 *     partial-index referencing in PG; VIRTUAL is unsupported for
 *     indexing)
 *   - The `jsonb_path_ops` operator class on the GIN index (using
 *     the default ops class would double the index size for no
 *     benefit; we only need `@>` containment queries)
 *   - The 3 indexes (we promised the FE a fast "all events where
 *     specialty X fired" query path)
 *   - The reverse `down()` blocks (a clean rollback is part of
 *     the contract)
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('1788000000000-AddMatchEventSpecialtyContributions migration', () => {
  const source = readFileSync(
    join(__dirname, '1788000000000-AddMatchEventSpecialtyContributions.ts'),
    'utf8',
  );

  describe('up()', () => {
    it('adds the specialty_contributions JSONB column with IF NOT EXISTS', () => {
      expect(source).toMatch(
        /ADD COLUMN IF NOT EXISTS "specialty_contributions" jsonb NULL/,
      );
    });

    it('creates STORED generated columns for primary code + tier', () => {
      // STORED is required because PG disallows indexing on VIRTUAL
      // generated columns. The `WHERE NOT NULL` partial index needs
      // a real (not virtual) column to point at.
      expect(source).toMatch(
        /ADD COLUMN IF NOT EXISTS "primary_specialty_code"[\s\S]*?GENERATED ALWAYS AS[\s\S]*?STORED/,
      );
      expect(source).toMatch(
        /ADD COLUMN IF NOT EXISTS "primary_specialty_tier"[\s\S]*?GENERATED ALWAYS AS[\s\S]*?STORED/,
      );
    });

    it('creates the 3 indexes (primary code, player+code, GIN)', () => {
      expect(source).toMatch(/CREATE INDEX IF NOT EXISTS "idx_event_primary_specialty"/);
      expect(source).toMatch(/CREATE INDEX IF NOT EXISTS "idx_player_specialty_fires"/);
      expect(source).toMatch(/CREATE INDEX IF NOT EXISTS "idx_event_specialty_gin"/);
    });

    it('uses jsonb_path_ops on the GIN index (smaller than default ops)', () => {
      // The default GIN operator class supports more operators but
      // doubles the index size. We only need `@>` containment, so
      // jsonb_path_ops is the right pick.
      expect(source).toMatch(/USING GIN \("specialty_contributions" jsonb_path_ops\)/);
    });

    it('all 3 indexes are partial (WHERE NOT NULL)', () => {
      // Partial keeps the index small — ~90% of events have no
      // specialty contribution so most rows would be NULL.
      expect(source).toMatch(
        /CREATE INDEX IF NOT EXISTS "idx_event_primary_specialty"[\s\S]*?WHERE "primary_specialty_code" IS NOT NULL/,
      );
      expect(source).toMatch(
        /CREATE INDEX IF NOT EXISTS "idx_player_specialty_fires"[\s\S]*?WHERE "primary_specialty_code" IS NOT NULL/,
      );
      expect(source).toMatch(
        /CREATE INDEX IF NOT EXISTS "idx_event_specialty_gin"[\s\S]*?WHERE "specialty_contributions" IS NOT NULL/,
      );
    });
  });

  describe('down()', () => {
    it('drops the 3 indexes before dropping the columns they reference', () => {
      // PG will refuse to drop a column that has an index pointing at
      // it. Order matters: indexes first, then columns.
      expect(source).toMatch(/DROP INDEX IF EXISTS "idx_event_specialty_gin"/);
      expect(source).toMatch(/DROP INDEX IF EXISTS "idx_player_specialty_fires"/);
      expect(source).toMatch(/DROP INDEX IF EXISTS "idx_event_primary_specialty"/);
    });

    it('drops all 3 columns in reverse dependency order', () => {
      // Generated columns must be dropped before the column they
      // derive from.
      expect(source).toMatch(/DROP COLUMN IF EXISTS "primary_specialty_tier"/);
      expect(source).toMatch(/DROP COLUMN IF EXISTS "primary_specialty_code"/);
      expect(source).toMatch(/DROP COLUMN IF EXISTS "specialty_contributions"/);
    });
  });
});
