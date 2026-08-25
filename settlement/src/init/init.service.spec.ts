import * as fs from 'fs';
import * as path from 'path';

/**
 * Source-level tripwires for `InitService.wipeAllData`.
 *
 * The wipe list is a hand-maintained array of table names
 * passed to `TRUNCATE TABLE … RESTART IDENTITY CASCADE`.
 * Drift in either direction is silently bad:
 *
 *   - **Drop a table** → the table survives a `--force`
 *     init and ends up referencing now-orphaned team /
 *     league / match ids (the historical bug: cup rows
 *     outliving their team rows, with bracket slots
 *     silently losing their home/away team FKs).
 *   - **Add the wrong table** → a dictionary or audit
 *     table is wiped on `--force`, breaking the
 *     dev / staging / prod id-alignment contract (RFC
 *     0002's `event_class_def` / `event_outcome_def`) or
 *     destroying historical traceability (`player_history`).
 *
 * Behavioural coverage of the wipe path itself would
 * require a live DB; pinning the source is cheaper and
 * catches the same drift class.
 */
describe('InitService — wipe-list tripwires', () => {
  const source = fs.readFileSync(
    path.join(__dirname, 'init.service.ts'),
    'utf8',
  );
  // Strip // line comments and /* … */ block comments so
  // the regex only sees code. Same trick as the
  // tactics-preset tripwire spec.
  const code = source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '');

  // Pull the `tables` array literal out of the source. We
  // grab everything from the first `const tables = [` to
  // the matching `];` and then extract every quoted
  // string. Robust enough to handle the current layout
  // (single-quoted entries, double-quoted for `"user"`).
  const arrayMatch = code.match(/const tables\s*=\s*\[([\s\S]*?)\];/);
  if (!arrayMatch) {
    throw new Error('Could not find `const tables = […]` in init.service.ts');
  }
  const tableNames = Array.from(
    new Set(
      Array.from(
        arrayMatch[1].matchAll(/'([^']+)'|"([^"]+)"/g),
      ).flatMap((m) => [m[1], m[2]].filter(Boolean) as string[]),
    ),
  );

  it('contains the four cup tables (cup, cup_round, cup_entry, cup_bracket_slot)', () => {
    // Historical bug: cup rows outlived their team rows,
    // leaving an orphaned cup with bracket slots whose
    // home/away team FKs SET NULLed on team-wipe. These
    // four tables are the cup family and ALL must be in
    // the wipe list, or the cup scheduler runs against
    // ghost rows on the next init.
    expect(tableNames).toEqual(expect.arrayContaining([
      'cup',
      'cup_round',
      'cup_entry',
      'cup_bracket_slot',
    ]));
  });

  it('does not wipe the RFC 0002 event dictionary tables', () => {
    // event_class_def and event_outcome_def hold
    // hand-assigned SMALLINT PKs that the FE has
    // hardcoded id→label maps for. Wiping them would
    // require a re-seed and risk id drift between
    // environments (the explicit reason in the wipe
    // method's docstring).
    expect(tableNames).not.toContain('event_class_def');
    expect(tableNames).not.toContain('event_outcome_def');
  });

  it('does not wipe the append-only player_history audit table', () => {
    // player_history is informational / audit-only. A
    // full game-state reset must not silently destroy
    // the historical record. If a future contributor
    // wants to clear it, the path should be explicit
    // (e.g. a dedicated `--reset-audit` flag), not
    // piggybacked onto `--force`.
    expect(tableNames).not.toContain('player_history');
  });

  it('does not include the migrations table (TRUNCATE would brick the schema version)', () => {
    // Belt-and-braces: the wipe method's docstring
    // already names `migrations` as the canonical
    // example of a table that must NOT be wiped. Pin it
    // so a future "completeness" pass doesn't add it.
    expect(tableNames).not.toContain('migrations');
  });
});
