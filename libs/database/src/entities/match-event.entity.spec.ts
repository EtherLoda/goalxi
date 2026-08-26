import * as fs from 'fs';
import * as path from 'path';

/**
 * Source-level tripwires on the match-event entity.
 *
 * These are NOT behavioural tests — they're pure
 * source-grep checks that pin the entity's column-
 * name overrides so a future contributor adding
 * a new RFC 0003-style generated column doesn't
 * silently re-introduce the bug fixed in this commit.
 *
 * Background — the bug:
 *
 *   TypeORM's `DefaultNamingStrategy.columnName()`
 *   returns the entity property name AS-IS. It does
 *   NOT do camelCase → snake_case conversion. So a
 *   property `primarySpecialtyCode` maps to column
 *   `"primarySpecialtyCode"` in the generated SQL,
 *   which PG treats as case-sensitive (the double
 *   quotes preserve case). The actual DB column is
 *   `"primary_specialty_code"` (snake_case, created
 *   in migration 1788000000000 with double quotes
 *   in the `ADD COLUMN` statement). The two don't
 *   match and the simulator's bulk-insert fails with
 *   `column "primarySpecialtyCode" of relation
 *   "match_event" does not exist`.
 *
 *   The fix is to add an explicit `name:` option to
 *   every entity field whose DB column name differs
 *   from the property name. This tripwire pins the
 *   two known mismatch fields so they can't
 *   regress.
 *
 *   For the v1-schema fields that ARE camelCase in
 *   both entity and DB (`shotType` / `bodyPart` /
 *   `cardType` / `injurySeverity` / `subPosition` /
 *   `penaltyOutcome` / `isHome`), the property name
 *   IS the column name, so no `name:` override is
 *   needed — TypeORM's "no conversion" behaviour is
 *   exactly what we want for these.
 */
describe('MatchEventEntity — source-level tripwires', () => {
  const source = fs.readFileSync(
    path.join(__dirname, 'match-event.entity.ts'),
    'utf8',
  );

  it('primarySpecialtyCode has explicit name: "primary_specialty_code"', () => {
    // The `name:` override is required because
    // TypeORM's DefaultNamingStrategy returns the
    // property name as-is (no snake_case conversion),
    // and the migration created the column as
    // snake_case with double quotes.
    expect(source).toMatch(
      /name:\s*['"]primary_specialty_code['"][\s\S]{0,200}primarySpecialtyCode\s*[?:]/,
    );
  });

  it('primarySpecialtyTier has explicit name: "primary_specialty_tier"', () => {
    // Same reasoning as primarySpecialtyCode.
    expect(source).toMatch(
      /name:\s*['"]primary_specialty_tier['"][\s\S]{0,200}primarySpecialtyTier\s*[?:]/,
    );
  });
});
