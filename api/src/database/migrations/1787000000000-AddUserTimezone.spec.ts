/**
 * Tripwire spec for migration 1787000000000-AddUserTimezone. Pure
 * unit — no DB connection — just confirms the migration file's intent
 * by reading the file content. Catches accidental removal of the
 * `DEFAULT 'UTC'` clause (which would break the NOT NULL constraint
 * on existing rows) and the `IF NOT EXISTS` guard (which would
 * crash on a re-run against a DB that's already been migrated).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('1787000000000-AddUserTimezone migration', () => {
  const source = readFileSync(
    join(__dirname, '1787000000000-AddUserTimezone.ts'),
    'utf8',
  );

  it('adds the timezone column with the correct type and default', () => {
    expect(source).toMatch(/ADD COLUMN IF NOT EXISTS "timezone"/);
    expect(source).toMatch(/varchar\(64\)/);
    expect(source).toMatch(/NOT NULL/);
    // The 'UTC' default is what keeps an existing user from violating
    // the NOT NULL constraint during the in-place ALTER TABLE.
    expect(source).toMatch(/DEFAULT 'UTC'/);
  });

  it('provides a down() that drops the column', () => {
    expect(source).toMatch(/DROP COLUMN IF EXISTS "timezone"/);
  });
});
