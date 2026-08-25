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

/**
 * Source-level tripwires for the "no bot-owner / no
 * system-user" init design.
 *
 * The pre-init design had two hard-coded user rows
 * created at init time:
 *
 *   - `system@goalxi.com` / `System123!` (a "system"
 *     user that wasn't actually used anywhere — the
 *     return value of `UserGenerator.ensureSystemUsers`
 *     was captured in a log message and never read).
 *   - `bot@goalxi.com` / `Bot123!` (a fake "bot
 *     manager" whose id was stamped on every BOT
 *     team as the owner — `team.userId`).
 *
 * Both have been dropped. Bot teams have no owning
 * user (`team.userId` lands as `null` for every row
 * `TeamGenerator` produces), and the system user is
 * not created at init. The only path that flips a
 * team to a real owner is the onboarding claim flow
 * (`OnboardingAssigner.claim`).
 *
 * Re-introducing either user silently regresses the
 * design: every bot team would again have a fake
 * owner, and the system user would sit unused in the
 * `user` table forever. These tripwires pin the
 * post-init state at the source surface.
 */
describe('InitService — no system / bot user', () => {
  const fs = require('fs');
  const path = require('path');

  function read(rel: string): string {
    return fs.readFileSync(
      path.join(__dirname, '..', '..', rel),
      'utf8',
    );
  }

  it('InitService does not import or instantiate UserGenerator', () => {
    // The init service had a `userGenerator: UserGenerator`
    // constructor param and a step that called
    // `userGenerator.ensureSystemUsers()`. Both are gone.
    // Pin the absence so a future "convenience" doesn't
    // re-add the system user.
    const initSource = read('src/init/init.service.ts');
    expect(initSource).not.toMatch(/UserGenerator/);
    expect(initSource).not.toMatch(/ensureSystemUsers/);
    expect(initSource).not.toMatch(/systemUserId|botUserId/);
  });

  it('scripts/init.ts CLI does not hand-roll a UserGenerator', () => {
    // The CLI in `scripts/init.ts` mirrors what the
    // `InitModule` (Nest DI) wires up. If the module
    // dropped the user generator but the CLI didn't,
    // `pnpm init:run` would still create a system user
    // even though the programmatic path wouldn't.
    const cliSource = read('scripts/init.ts');
    expect(cliSource).not.toMatch(/UserGenerator/);
    expect(cliSource).not.toMatch(/ensureSystemUsers/);
  });

  it('BootstrapModule does not register UserGenerator as a provider', () => {
    // The auto-recover path (`BootstrapService.onModuleInit`)
    // runs when the settlement process boots against a
    // missing `system_config.init_date`. Pin the absence
    // of the user generator on that side too.
    const moduleSource = read(
      'src/bootstrap/bootstrap.module.ts',
    );
    expect(moduleSource).not.toMatch(/UserGenerator/);
  });

  it('the UserGenerator source file has been removed', () => {
    // Belt-and-braces: if a future refactor adds a
    // `UserGenerator` import to the init path but the
    // file itself is gone, the import is broken at
    // build time. Pin the file removal so a "where
    // did this go?" archaeology session has the
    // answer baked into the test name.
    const filePath = path.join(
      __dirname,
      '..',
      '..',
      'src',
      'bootstrap',
      'generators',
      'user.generator.ts',
    );
    expect(fs.existsSync(filePath)).toBe(false);
  });

  it('settlement init path carries no hard-coded system/bot credentials', () => {
    // The "no fake user" design is also a "no fake
    // password" design. A `system@goalxi` or
    // `bot@goalxi` string anywhere in the init path
    // (init service, init script, the bootstrap module)
    // is a regression. The forum migration has a
    // separate `system@goalxi.local` row — that one
    // is forum-internal, not in the init path, and
    // is excluded from the search by scoping the
    // assertion to the three init-pipeline files.
    const initFiles = [
      'src/init/init.service.ts',
      'src/init/init.module.ts',
      'src/bootstrap/bootstrap.module.ts',
      'src/bootstrap/bootstrap.service.ts',
      'scripts/init.ts',
    ];
    for (const rel of initFiles) {
      const src = read(rel);
      // Comment-strip so a docstring that DESCRIBES the
      // removed hard-coded user ("we used to have
      // system@goalxi.com, see commit X") doesn't trip
      // the test on its own prose.
      const code = src
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/.*$/gm, '');
      expect(code).not.toMatch(/system@goalxi/);
      expect(code).not.toMatch(/bot@goalxi/);
      expect(code).not.toMatch(/System123/);
      expect(code).not.toMatch(/Bot123/);
    }
  });
});

/**
 * Source-level tripwire for the "parallel pass" at
 * the tail of the init pipeline. Steps 5-9
 * (presets / scout seeds / schedule / weather /
 * announcements) all read from the team + league
 * tables that steps 3-4 just populated, and they
 * each write to a disjoint table — so they run in
 * parallel via `Promise.all` rather than serially.
 *
 * The parallel pass saves ~2s of wall-clock on a
 * `--force` init. Re-serialising the five
 * generators (i.e. dropping the `Promise.all`)
 * would silently bring the regression back; the
 * tripwire pins the source so a future "clean-up"
 * that unwraps the parallel pass to "make it
 * easier to read" fails the test.
 */
describe('InitService — parallel pass (5-9)', () => {
  const fs = require('fs');
  const path = require('path');
  const source = fs.readFileSync(
    path.join(__dirname, 'init.service.ts'),
    'utf8',
  );
  // Strip comments so a docstring mention of
  // `Promise.all` (the "what" prose) doesn't trip the
  // test on its own commentary.
  const code = source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '');

  it('runs presets / scout seeds / schedule / weather / announcements in parallel via Promise.all', () => {
    // The 5 generator calls must all sit inside one
    // `Promise.all([...])` block, NOT a serial chain
    // of `await`s. The structural shape is the only
    // thing the tripwire cares about — a future
    // refactor that splits the call sites (for
    // separate logging, separate error handling, …)
    // can re-add the Promise.all wrapper; what we
    // forbid is the bare `await x; await y; await z;`
    // serialisation.
    expect(code).toMatch(/Promise\.all\(\s*\[/);
    // All five generators must appear in the
    // Promise.all array — pinning the set pins the
    // contract that no generator is silently dropped
    // or re-serialised by mistake.
    for (const name of [
      'tacticsPresetGenerator',
      'scoutSeedGenerator',
      'scheduleGenerator',
      'weatherGenerator',
      'announcementGenerator',
    ]) {
      // The generator reference must appear
      // somewhere inside the Promise.all block.
      // We anchor on the Promise.all open bracket
      // and check that the generator name is found
      // between it and the matching close — best-
      // effort via indexOf because the close bracket
      // is harder to match with regex.
      const paIdx = code.indexOf('Promise.all(');
      const slice = code.slice(paIdx, paIdx + 2000);
      expect(slice).toContain(name);
    }
  });
});
