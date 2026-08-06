/**
 * Static tripwire for the youth_coach enum-removal migration.
 *
 * The first version of this migration did:
 *   1. UPDATE staff SET is_active = false WHERE role = 'youth_coach'
 *   2. DELETE FROM coach_player_assignment WHERE coach_id IN
 *      (SELECT id FROM staff WHERE role = 'youth_coach')
 *   3. ALTER TYPE staff_role_enum DROP VALUE IF EXISTS 'youth_coach'
 *
 * Step (1) flipped is_active but DID NOT change `role`, so the staff
 * rows still carried `role = 'youth_coach'` when step (3) ran. The
 * intended DROP failed with "value still in use".
 *
 * The second version used `ALTER TYPE ... DROP VALUE`, which PG 17
 * supports but PG 16 does not — the user's dev DB is PG 16.
 *
 * The current version does the classic 4-step "swap enum type"
 * dance: build a `_new` enum without `youth_coach`, ALTER the
 * column, DROP the old type, RENAME the new one back. Cheap string
 * assertions pin the SQL structure so the next refactor doesn't
 * regress.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

describe('1724000000000-RemoveYouthCoachRole', () => {
  let upSql: string;
  let downSql: string;

  beforeAll(() => {
    const path = join(__dirname, '1724000000000-RemoveYouthCoachRole.ts');
    const source = readFileSync(path, 'utf-8');
    const upIdx = source.indexOf('public async up(');
    if (upIdx < 0) throw new Error('up() not found in migration');
    upSql = source.slice(upIdx);
    // Slice the down() block off the up() string so up-only
    // assertions can't accidentally match the down() body.
    const downIdxInUp = upSql.indexOf('public async down(');
    if (downIdxInUp > 0) upSql = upSql.slice(0, downIdxInUp);
    // The down() body is sliced from the original source so the
    // down assertions below have a clean substring to match.
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

  it('does NOT use ALTER TYPE ... DROP VALUE (Postgres 16 does not support it)', () => {
    // PG 17 added `ALTER TYPE ... DROP VALUE`. The dev DB is on
    // PG 16, so any version that relies on the new syntax will
    // fail with a syntax error. This assertion pins the 4-step swap.
    expect(codeOnly(upSql)).not.toMatch(/ALTER\s+TYPE[\s\S]*?DROP\s+VALUE/i);
  });

  it('re-roles youth_coach staff rows BEFORE the enum swap', () => {
    // The `ALTER COLUMN ... TYPE` step casts every value through
    // text. Any row still carrying `'youth_coach'` after the cast
    // would blow up with "invalid input value for enum". The
    // re-role UPDATE must come first.
    const updateAt = codeOnly(upSql).search(
      /UPDATE\s+"?staff"?[\s\S]*?"role"[\s\S]*?=/i,
    );
    const alterAt = codeOnly(upSql).search(
      /ALTER\s+TABLE\s+"?staff"?[\s\S]*?TYPE/i,
    );
    expect(updateAt).toBeGreaterThan(-1);
    expect(alterAt).toBeGreaterThan(-1);
    expect(updateAt).toBeLessThan(alterAt);
  });

  it('uses the 4-step swap dance: create-new → alter-column → drop-old → rename', () => {
    const steps = [
      // 1. CREATE TYPE staff_role_enum_new ...
      /CREATE\s+TYPE[\s\S]*?staff_role_enum_new/i,
      // 2. ALTER TABLE staff ... TYPE staff_role_enum_new
      /ALTER\s+TABLE\s+"?staff"?[\s\S]*?TYPE[\s\S]*?staff_role_enum_new/i,
      // 3. DROP TYPE staff_role_enum
      /DROP\s+TYPE\s+"?public"?\.?"?staff_role_enum"?/i,
      // 4. ALTER TYPE staff_role_enum_new RENAME TO staff_role_enum
      /ALTER\s+TYPE[\s\S]*?staff_role_enum_new[\s\S]*?RENAME\s+TO\s+"?staff_role_enum"?/i,
    ];
    const text = codeOnly(upSql);
    const positions = steps.map((re) => text.search(re));
    positions.forEach((p, i) => {
      if (p < 0) {
        throw new Error(`4-step dance step ${i + 1} not found in up()`);
      }
      expect(p).toBeGreaterThan(-1);
    });
    // Steps must appear in the documented order so the column is
    // never type-incompatible with the data it holds.
    const sorted = [...positions].sort((a, b) => a - b);
    expect(positions).toEqual(sorted);
  });

  it('does not DELETE FROM staff (preserves historical record)', () => {
    // The team-doctor reassignment is a one-way ticket — we
    // intentionally keep the staff rows (with their salary /
    // contract history) so the user can re-fire or re-role later.
    expect(codeOnly(upSql)).not.toMatch(/DELETE\s+FROM\s+"?staff"?/i);
  });

  it('down() mirrors the 4-step swap so the role can be restored', () => {
    // The down() re-creates the old enum (with youth_coach) and
    // swaps the column back. This pins the symmetry so a future
    // refactor of the up() doesn't accidentally leave the down
    // unable to revert.
    expect(codeOnly(downSql)).toMatch(/ALTER\s+TYPE[\s\S]*?RENAME\s+TO/i);
    expect(codeOnly(downSql)).toMatch(/staff_role_enum_old/i);
  });
});
