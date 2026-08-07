/**
 * Static tripwire for the severity-merge migration.
 *
 * The migration collapses the 3-tier injury severity (1=mild,
 * 2=moderate, 3=severe) into a 2-tier model (1=mild, 2=severe).
 * The remap is data-only: severity=3 is rewritten to 2 because both
 * the old "moderate" (severity=2) and the old "severe" (severity=3)
 * share the new "severe" semantic.
 *
 * The assertions below pin three things so a future refactor doesn't
 * regress:
 *
 *   1. The remap is `severity = 3 → 2`, not the other way around.
 *      Flipping the direction would silently re-define every existing
 *      "severe" row as "mild" and every "moderate" row as "severe",
 *      which is the opposite of what we want.
 *   2. A defensive clamp keeps any out-of-range row at 2, but never
 *      silently rewrites severity=1 to something else (so old "mild"
 *      rows don't get re-categorised on a partial run).
 *   3. The down() refuses to run, because the original 2/3 split
 *      is not recoverable from the collapsed rows. Anyone wanting to
 *      roll back has to restore from backup.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

describe('1729000000000-MergeInjurySeverity', () => {
  let upSql: string;
  let downSql: string;

  beforeAll(() => {
    const path = join(__dirname, '1729000000000-MergeInjurySeverity.ts');
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

  // Strip `//` comments so a NOTE in a comment line doesn't
  // false-positive the regexes below.
  const codeOnly = (s: string) =>
    s
      .split('\n')
      .filter((l) => !l.trim().startsWith('//'))
      .join('\n');

  it('remaps severity=3 → 2 (NOT the other way around)', () => {
    // The remap must be 3 → 2, never 2 → 3. A typo would invert
    // the semantic collapse.
    expect(codeOnly(upSql)).toMatch(
      /UPDATE[\s\S]*?"injury"[\s\S]*?SET[\s\S]*?"severity"[\s\S]*?=\s*2[\s\S]*?WHERE[\s\S]*?"severity"[\s\S]*?=\s*3/i,
    );
    expect(codeOnly(upSql)).not.toMatch(
      /UPDATE[\s\S]*?"injury"[\s\S]*?SET[\s\S]*?"severity"[\s\S]*?=\s*3[\s\S]*?WHERE[\s\S]*?"severity"[\s\S]*?=\s*2/i,
    );
  });

  it('never touches severity=1 (mild stays mild)', () => {
    // A defensive clamp for out-of-range rows must not silently
    // rewrite severity=1 (the only valid "mild" value).
    expect(codeOnly(upSql)).not.toMatch(
      /UPDATE[\s\S]*?"injury"[\s\S]*?SET[\s\S]*?"severity"[\s\S]*?=\s*[23][\s\S]*?WHERE[\s\S]*?"severity"[\s\S]*?=\s*1/i,
    );
  });

  it('down() refuses to run (the 2/3 split is not recoverable)', () => {
    // The down() is intentionally non-functional: splitting
    // "moderate" and "severe" back out from the collapsed rows
    // requires knowing which 2s were originally 2s, which is gone.
    expect(codeOnly(downSql)).toMatch(/throw\s+new\s+Error/);
  });
});
