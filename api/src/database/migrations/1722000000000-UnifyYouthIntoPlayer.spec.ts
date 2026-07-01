/**
 * Lightweight regression tests for the unify-youth-into-player migration.
 *
 * The data unification migration has a `down()` that, by accident,
 * was selecting `p."joined_at"` from the unified `player` table.
 * `joined_at` was dropped by migration 1721000000000
 * (ReplaceBirthdayWithCreatedDay) before this one ran, so a real
 * rollback would 5xx on the missing column.
 *
 * This spec is a static "linter" — it reads the migration's source
 * text and fails if the bad reference comes back. It's a cheap
 * tripwire, not a full migration integration test.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

describe('1722000000000-UnifyYouthIntoPlayer down()', () => {
  let source: string;
  // Pull the SQL inside `down()` by splitting on `public async down`.
  // Good enough for a static assertion; full AST parsing isn't worth
  // the dependency here.
  let downSql: string;

  beforeAll(() => {
    const path = join(__dirname, '1722000000000-UnifyYouthIntoPlayer.ts');
    source = readFileSync(path, 'utf-8');
    const idx = source.indexOf('public async down(');
    if (idx < 0) throw new Error('down() not found in migration');
    downSql = source.slice(idx);
  });

  it('does not reference the dropped p."joined_at" column', () => {
    // Strip comments so a NOTE in a `//` line doesn't false-positive.
    const codeOnly = downSql
      .split('\n')
      .filter((l) => !l.trim().startsWith('//'))
      .join('\n');
    expect(codeOnly).not.toMatch(/p\."joined_at"/);
  });

  it('backfills joined_at with p."created_at" (the only available timestamp)', () => {
    // The youth_player.joined_at column was NOT NULL, so the down()
    // must supply a value. created_at is the closest proxy.
    expect(downSql).toMatch(/p\."created_at"/);
  });

  it('keeps the "is_youth = true" filter so the down() does not pull senior rows', () => {
    expect(downSql).toMatch(/p\."is_youth"\s*=\s*true/);
  });
});
