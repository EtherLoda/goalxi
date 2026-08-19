/**
 * Static tripwire for the player.position length-widening migration.
 *
 * Pinned SQL properties:
 *  1. Targets the `player` table — the only column whose original
 *     `varchar(8)` was a foot-gun for the bench bucket names
 *     (9 chars). The bench_config JSONB column already accepts
 *     arbitrary lengths.
 *  2. `up()` widens to 16; `down()` narrows back to 8. The pair
 *     must remain symmetric so a future refactor that picks one
 *     side can't accidentally leave the other unable to revert.
 *  3. No data backfill: `ALTER COLUMN ... TYPE` is a metadata
 *     change on a `varchar` (no in-place rewrite), and the column
 *     is nullable so no row has to be touched.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

describe('1733000000000-ExtendPlayerPositionLength', () => {
  let upSql: string;
  let downSql: string;

  beforeAll(() => {
    const path = join(__dirname, '1733000000000-ExtendPlayerPositionLength.ts');
    const source = readFileSync(path, 'utf-8');
    const upIdx = source.indexOf('public async up(');
    if (upIdx < 0) throw new Error('up() not found in migration');
    upSql = source.slice(upIdx);
    const downIdxInUp = upSql.indexOf('public async down(');
    if (downIdxInUp > 0) upSql = upSql.slice(0, downIdxInUp);
    const downStart = source.indexOf('public async down(');
    if (downStart < 0) throw new Error('down() not found in migration');
    downSql = source.slice(downStart);
  });

  // Strip `//` comments so a NOTE in a comment line doesn't false-positive.
  const codeOnly = (s: string) =>
    s
      .split('\n')
      .filter((l) => !l.trim().startsWith('//'))
      .join('\n');

  it('up() targets the player table', () => {
    // Pinned so a future copy-paste can't accidentally widen the
    // wrong column.
    expect(codeOnly(upSql)).toMatch(/ALTER\s+TABLE\s+"?player"?/i);
  });

  it('up() widens the column to 16 characters', () => {
    // `BENCH_GK` is 9 chars and the longest canonical key in
    // position-keys.constants.ts. 16 leaves headroom for any
    // future prefix like `BENCH_GK_2` without another migration.
    expect(codeOnly(upSql)).toMatch(/varchar\s*\(\s*16\s*\)/i);
  });

  it('up() does not add a default or backfill rows', () => {
    // The column is nullable and the data is mostly NULL (see
    // the file header). A backfill UPDATE would lock-scan the
    // table for no behavioural benefit; if a future migration
    // needs one it should be its own step.
    expect(codeOnly(upSql)).not.toMatch(/UPDATE\s+"?player"?/i);
    expect(codeOnly(upSql)).not.toMatch(/SET\s+DEFAULT/i);
  });

  it('down() narrows the column back to 8 characters', () => {
    // Symmetric with up() so the migration is safely revertable.
    expect(codeOnly(downSql)).toMatch(/varchar\s*\(\s*8\s*\)/i);
    expect(codeOnly(downSql)).toMatch(/ALTER\s+TABLE\s+"?player"?/i);
  });

  it('down() mirrors the table name (no typo)', () => {
    // A typo like `players` would silently succeed (the table
    // doesn't exist) and leave the real column at 16 forever.
    expect(codeOnly(downSql)).toMatch(
      /ALTER\s+TABLE\s+"?player"?\s+ALTER\s+COLUMN\s+"?position"?/i,
    );
  });
});
