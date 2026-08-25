import { WeatherGenerator } from './weather.generator';
import { LOGGER_SERVICE } from '@goalxi/logger';
import { WeatherEntity } from '@goalxi/database';

/**
 * Tripwires for `WeatherGenerator.formatDate`.
 *
 * The dates this generator writes are constructed in UTC
 * (`Date.UTC(y, m, d, 0, 0, 0, 0)`), so the formatter must
 * be UTC-anchored too. The historical implementation
 * used `getFullYear()` / `getMonth()` / `getDate()` —
 * local-time accessors that silently drift by one day in
 * negative-UTC timezones (UTC-12 to UTC-5: midnight UTC
 * is on the previous local day). The FE / API match
 * lookups compare the row's `date` string against a
 * `Date.toISOString().slice(0, 10)`-shaped key from the
 * request side, so a one-day drift caused silent
 * "no weather found" failures on any non-UTC+ deployment.
 *
 * Behavioural coverage would require a live DB to
 * observe the actual row's date, so the spec pins the
 * fix at the source instead: the `formatDate` method
 * must be UTC-anchored.
 */
describe('WeatherGenerator — formatDate UTC anchoring', () => {
  const mockLogger = {
    info: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    error: jest.fn(),
  };
  const gen = new WeatherGenerator(
    mockLogger as any,
    { find: jest.fn(), create: jest.fn(), save: jest.fn() } as any,
  );

  it('formats a UTC midnight as that UTC calendar day, not the local day', () => {
    // 2026-09-09T00:00:00Z. In UTC+8 this is 08:00 local on
    // the 9th; in UTC-12 it's noon local on the 8th. The
    // UTC-anchored formatter must return "2026-09-09"
    // regardless of the runtime TZ.
    const utcMidnight = new Date(Date.UTC(2026, 8, 9, 0, 0, 0, 0));
    expect((gen as any).formatDate(utcMidnight)).toBe('2026-09-09');
  });

  it('formats a non-midnight UTC instant by the UTC calendar day', () => {
    // Same day at 16:00 UTC. In UTC+8 this rolls over to
    // 00:00 local on the 10th — the local-time formatter
    // would return "2026-09-10" here, off by one. The
    // UTC-anchored formatter stays on the 9th.
    const utcMidAfternoon = new Date(Date.UTC(2026, 8, 9, 16, 0, 0, 0));
    expect((gen as any).formatDate(utcMidAfternoon)).toBe('2026-09-09');
  });

  it('formats the month and day with zero-padding (YYYY-MM-DD shape)', () => {
    // January 5 — month / day are both single-digit without
    // padding. A naive `String(month + 1)` formatter would
    // return "2026-1-5"; the contract is "2026-01-05".
    const early = new Date(Date.UTC(2026, 0, 5, 0, 0, 0, 0));
    expect((gen as any).formatDate(early)).toBe('2026-01-05');
  });

  /**
   * Source-level tripwire. The behavioural tests above
   * pin the contract on the *current* implementation; this
   * tripwire makes the next regression fail at test time
   * rather than in production.
   */
  it('source-level: does not use local-time date accessors', () => {
    const fs = require('fs');
    const path = require('path');
    const source = fs.readFileSync(
      path.join(__dirname, 'weather.generator.ts'),
      'utf8',
    );
    // Strip block + line comments so a docstring mention
    // of the local-time accessors (e.g. "in the local
    // timezone the bug would manifest") doesn't trip
    // the test on its own prose.
    const code = source
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '');

    // The local-time accessors that caused the bug must
    // not reappear inside the `formatDate` method body.
    // Match the method body by finding the declaration
    // and then everything up to the next balanced
    // closing brace. We do this by capturing from
    // `formatDate(` to the next `^  }` line (the
    // method-close indent pattern in this file).
    const formatDateMatch = code.match(
      /formatDate\s*\([^)]*\)\s*:\s*\S+\s*\{([\s\S]*?)\n\s*\}/m,
    );
    expect(formatDateMatch).not.toBeNull();
    const formatBody = formatDateMatch![1];
    expect(formatBody).not.toMatch(/\bgetFullYear\s*\(/);
    expect(formatBody).not.toMatch(/\bgetMonth\s*\(/);
    expect(formatBody).not.toMatch(/\bgetDate\s*\(/);
    // And the canonical UTC-anchored shape must be in
    // there (or an equivalent like `toISOString`).
    expect(formatBody).toMatch(/toISOString|getUTCFullYear/);
  });
});
