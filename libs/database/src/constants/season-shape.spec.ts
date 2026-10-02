import { readdirSync, readFileSync, statSync } from "fs";
import { join } from "path";

/**
 * Tripwire for the 16w2m → 11w3m season compression.
 *
 * ## The failure mode this prevents
 *
 * The season went from 16 weeks × 2 fixtures to 11 weeks × 3 fixtures.
 * Nothing about that is type-checked. Every place that had a bare `16`,
 * `15`, `112` or `16 * 7` in it was a place that had to be found by
 * reading, and the ones that were missed did not crash — they silently
 * stopped firing:
 *
 *   - `league-award.service.ts` gated awards on `week: 16`. At 11 weeks
 *     that gate never opened, so **no league prize money was ever paid**.
 *   - `season-test-cli.ts` gated the playoff on `week === 15` and the
 *     season rollover on `week === 16`. Both became "never".
 *   - `ensureSecondHalfFixtures` derived the reverse fixture from
 *     `Math.floor(round / 2)` with a `% 2 === 0 ? 2 : 5` home/away
 *     rule. The odd/even flip had to move with the round count, and did
 *     not — so second-half fixtures were assigned to the wrong sides.
 *
 * Each of those is a plausible-looking line of code. A future edit that
 * reintroduces one would pass every unit test, because the tests assert
 * what the function returns, not that the *gate* can still open.
 *
 * ## How this works
 *
 * Scans source text for re-introductions. Deliberately crude, and the
 * same technique as `services/formula-consolidation.spec.ts`. It is a
 * textual invariant, not a semantic one: it cannot tell a legitimate `16`
 * from a season length, which is why the rules below are narrow (bare
 * comparisons and season-shaped arithmetic) and why the allow-list
 * records a reason per entry.
 */

/** Directories whose runtime behaviour the compression actually governs. */
const SCANNED_ROOTS = [
  "libs/database/src",
  "api/src",
  "settlement/src",
  "settlement/scripts",
  "simulator/src",
];

/**
 * Identifiers that legitimately spell out a season length. Anything whose
 * value *is* the season shape is exempt by name — that is the point of the
 * constants, not a loophole in the check.
 */
const SHAPE_NAMES =
  "\\b(?:GAME_SETTINGS|SEASON_LENGTH_WEEKS|DAYS_PER_YEAR|ROUNDS_PER_WEEK|MATCH_DAY_OFFSETS|BASE_WEEKLY_TRAINING_PER_YEAR|DECLINE_BASE_RATE_PER_YEAR)\\b";

interface Rule {
  /** Human-readable name, used in the failure message. */
  label: string;
  /**
   * Matched against the source with comments already stripped, so a
   * prose mention of "16 weeks" cannot trip it.
   */
  re: RegExp;
  /** Why, in the failure message. */
  why: string;
}

/**
 * Ordered so the most specific rules run first; the first hit per file is
 * reported.
 */
const RULES: Rule[] = [
  {
    label: "second-half reverse-fixture home/away parity rule",
    re: /%\s*2\s*===\s*0\s*\?\s*2\s*:\s*5/,
    why: "the `? 2 : 5` branch count must track ROUNDS_PER_WEEK, not the 16-week fixture count",
  },
  {
    label: "reverse-fixture leg derivation",
    // Anchored on the round/leg vocabulary so it does not catch every
    // halving in the codebase — `thielen-ehv.ts` computes
    // `sqrt(N / 2)`, which is the differential-equation solution for
    // chase probability and has nothing to do with matchweeks.
    re: /Math\.(?:floor|round)\(\s*(?:\w+\.)?(?:round|leg|fixture|matchweek|half)\w*\s*\/\s*2\s*\)(\s*\+\s*\w+\.length)?/i,
    why: "leg = round/2 was valid for 2 fixtures a week; derive it from ROUNDS_PER_WEEK",
  },
  {
    label: "bare matchweek gate",
    re: /\bweek\s*(?:===|!==|==|!=)\s*(?:1[56])\b/,
    why: "week 15/16 gates silently became unreachable at 11 weeks; use SEASON_LENGTH_WEEKS or ROUNDS_PER_WEEK",
  },
  {
    label: "bare matchweek literal in a week field",
    re: /\bweek\s*:\s*(?:1[56])\b/,
    why: "same as above — a fixture tagged `week: 16` is never created",
  },
  {
    label: "total matchweek count",
    re: /\btotalMatchweeks?\s*=\s*16\b|\brounds\s*[:=]\s*16\b|\bmatchweeks\s*[:=]\s*16\b/,
    why: "total matchweeks is now ROUNDS_PER_WEEK * SEASON_LENGTH_WEEKS",
  },
  {
    label: "season length arithmetic",
    re: /(?<![.\w])\d+\s*\*\s*7(?![.\w])/,
    why: "16 * 7 = 112 game-days; DAYS_PER_YEAR now derives this",
  },
  {
    label: "bare game-days-per-season literal",
    re: /(?:DAYS_PER_YEAR|daysPerYear|days_per_year|daysPerSeason)\s*(?:[:=]|\*)\s*(?:===)?\s*112\b/,
    why: "DAYS_PER_YEAR is SEASON_LENGTH_WEEKS * 7",
  },
];

/**
 * Files allowed to violate a rule, per rule label. Each entry carries a
 * reason so a future reader can tell a deliberate exception from an
 * oversight.
 */
const ALLOWED: Record<string, string[]> = {
  "bare matchweek gate": [
    // Both are regression specs that pin the *fixed* behaviour by
    // feeding week 11 in. The number under test is the week index,
    // not a season length.
    "settlement/src/scheduler/season-transition.service.spec.ts",
  ],
  "second-half reverse-fixture home/away parity rule": [],
  "reverse-fixture leg derivation": [],
  "bare matchweek literal in a week field": [],
  "total matchweek count": [],
  "season length arithmetic": [],
  "bare game-days-per-season literal": [
    // A historical migration. Frozen by definition — it records the
    // schema as of that date, not the current season config, and
    // rewriting it would corrupt the migration history.
    "api/src/database/migrations/1721000000000-ReplaceBirthdayWithCreatedDay.ts",
  ],
};

describe("season shape 16w2m → 11w3m (literal tripwire)", () => {
  const offenders: string[] = [];
  const ruleLabels = new Set(RULES.map((r) => r.label));

  it("found the source tree to scan (sanity check on the walk)", () => {
    const files = SCANNED_ROOTS.flatMap((r) => walk(join(REPO_ROOT, r)));
    expect(files.length).toBeGreaterThan(300);
  });

  it("no season-length literal has been re-introduced", () => {
    for (const file of SCANNED_ROOTS.flatMap((r) => walk(join(REPO_ROOT, r)))) {
      const rel = relative(file);

      // This spec quotes the very literals it forbids (in the rule
      // regexes and the rationale strings), so it must exclude
      // itself. Other specs are scanned: a spec that hardcodes a
      // season length is how a stale fixture count survives.
      if (rel === "libs/database/src/constants/season-shape.spec.ts") continue;

      const src = stripComments(readFileSync(file, "utf8"));

      for (const rule of RULES) {
        if (ALLOWED[rule.label]?.includes(rel)) continue;
        const m = src.match(rule.re);
        if (!m) continue;

        offenders.push(
          `${rel} — ${rule.label}: matched \`${m[0].trim()}\`\n    ${rule.why}`,
        );
        break; // one report per file is enough
      }
    }

    expect(offenders).toEqual([]);
  });

  it("every allow-list entry points at a file that still exists", () => {
    // An exception list that outlives its file silently stops being an
    // exception, so the file would stop being scanned.
    const stale: string[] = [];
    for (const [label, list] of Object.entries(ALLOWED)) {
      expect(ruleLabels.has(label)).toBe(true);
      for (const rel of list) {
        if (!exists(join(REPO_ROOT, rel))) stale.push(`${label}: ${rel}`);
      }
    }
    expect(stale).toEqual([]);
  });

  it("has a non-empty allow-list key for every rule", () => {
    // A missing key means a new rule was added without deciding
    // whether anything is exempt — Object.entries would not catch it.
    for (const rule of RULES) {
      expect(ALLOWED).toHaveProperty(rule.label);
    }
  });
});

/**
 * The constants themselves. The tripwire above only proves that literals
 * have not crept back into *call sites*; these assertions are what pin
 * the values, so a well-meaning edit to `game.constants.ts` fails here
 * rather than silently re-compressing the season.
 */
describe("season shape constants", () => {
  // Imported lazily so this file's textual rules stay readable above.
  const { GAME_SETTINGS } =
    require("./game.constants") as typeof import("./game.constants");

  it("no week gate branches on ROUNDS_PER_WEEK", () => {
    // A wrong *derivation* is invisible to the RULES table above.
    //
    // `season-test-cli.ts` gated promotions on a bare `week === 15`.
    // Replacing it with `week === GAME_SETTINGS.ROUNDS_PER_WEEK + 1`
    // removed the literal — so every rule above went quiet — while being
    // wrong: `ROUNDS_PER_WEEK` is matches per week (3), not the length of
    // the regular season, which is `SEASON_LENGTH_WEEKS - 1` (10).
    // Promotions fired in week 4, and only the full-season E2E caught it.
    //
    // So: a week gate may not mention `ROUNDS_PER_WEEK` at all.
    const offenders: string[] = [];
    for (const file of SCANNED_ROOTS.flatMap((r) => walk(join(REPO_ROOT, r)))) {
      const rel = relative(file);
      if (rel === "libs/database/src/constants/season-shape.spec.ts") continue;

      const src = stripComments(readFileSync(file, "utf8"));
      const re =
        /\bweek\s*(?:===|!==|==|!=|<|>|<=|>=)[^;{]*?\bROUNDS_PER_WEEK\b/g;
      for (const m of src.match(re) ?? []) {
        offenders.push(`${rel}: \`${m.trim()}\``);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("the regular season is 10 weeks and the playoff week is the 11th", () => {
    expect(GAME_SETTINGS.SEASON_LENGTH_WEEKS - 1).toBe(10);
    expect(GAME_SETTINGS.ROUNDS_PER_WEEK).toBe(3);
    // Different quantities — which is the whole reason the rule above
    // exists. If these ever legitimately converge, delete that rule in the
    // same commit rather than letting it rot.
    expect(GAME_SETTINGS.ROUNDS_PER_WEEK).not.toBe(
      GAME_SETTINGS.SEASON_LENGTH_WEEKS - 1,
    );
  });

  it("season-test-cli gates the regular season and the rollover on SEASON_LENGTH_WEEKS", () => {
    const src = readFileSync(
      join(REPO_ROOT, "settlement/scripts/season-test-cli.ts"),
      "utf8",
    );
    expect(src).toContain(
      "const lastRegularWeek = GAME_SETTINGS.SEASON_LENGTH_WEEKS - 1;",
    );
    expect(src).toContain("if (week === GAME_SETTINGS.SEASON_LENGTH_WEEKS) {");
  });

  it("SEASON_LENGTH_WEEKS is 11", () => {
    expect(GAME_SETTINGS.SEASON_LENGTH_WEEKS).toBe(11);
  });

  it("ROUNDS_PER_WEEK is 3", () => {
    expect(GAME_SETTINGS.ROUNDS_PER_WEEK).toBe(3);
  });

  it("a double round-robin fits inside the regular season", () => {
    // The fixture count is set by the league size, not by the season
    // length: `2 * (N - 1)` per team. What the season length has to
    // accommodate is that many rounds.
    //
    // The last round lands on `floor((2N - 3) / ROUNDS_PER_WEEK) + 1`,
    // and it must stay inside the regular season — the final week of
    // the season belongs to the promotion/relegation playoffs. At 16
    // teams that is 30 rounds ending on week 10 of 10.
    //
    // Note there is ZERO slack: 30 rounds is exactly 10 x 3. Sixteen
    // teams is the precise ceiling for this season shape, not an
    // approximation of one. That is what the generator's upper-bound
    // guard is derived from.
    const regularSeasonWeeks = GAME_SETTINGS.SEASON_LENGTH_WEEKS - 1;
    const rounds = 2 * (16 - 1);
    const lastRoundWeek =
      Math.floor((rounds - 1) / GAME_SETTINGS.ROUNDS_PER_WEEK) + 1;

    expect(rounds).toBe(30);
    expect(lastRoundWeek).toBe(regularSeasonWeeks);
    expect(rounds).toBe(regularSeasonWeeks * GAME_SETTINGS.ROUNDS_PER_WEEK);
  });

  it("17 teams would overflow the regular season", () => {
    // Pins WHY the generator has an upper-bound guard. 32 rounds ends
    // on week 11, which is the playoff week.
    const regularSeasonWeeks = GAME_SETTINGS.SEASON_LENGTH_WEEKS - 1;
    const lastRoundWeek =
      Math.floor((2 * (17 - 1) - 1) / GAME_SETTINGS.ROUNDS_PER_WEEK) + 1;

    expect(lastRoundWeek).toBeGreaterThan(regularSeasonWeeks);
  });

  it("DAYS_PER_YEAR is derived, and equals 77", () => {
    expect(GAME_SETTINGS.DAYS_PER_YEAR).toBe(
      GAME_SETTINGS.SEASON_LENGTH_WEEKS * 7,
    );
    expect(GAME_SETTINGS.DAYS_PER_YEAR).toBe(77);
  });

  it("MATCH_DAY_OFFSETS is three Tue/Thu/Sat slots", () => {
    expect(GAME_SETTINGS.MATCH_DAY_OFFSETS).toEqual([1, 3, 5]);
    expect(GAME_SETTINGS.MATCH_DAY_OFFSETS.length).toBe(
      GAME_SETTINGS.ROUNDS_PER_WEEK,
    );
  });
});

/**
 * Walk up to the workspace root by looking for `pnpm-workspace.yaml`
 * rather than counting `..` segments — this spec is reached through both
 * `src/` and `dist/`, and the depth differs between them.
 */
function findRepoRoot(start: string): string {
  let dir = start;
  for (let i = 0; i < 10; i++) {
    if (exists(join(dir, "pnpm-workspace.yaml"))) return dir;
    const parent = join(dir, "..");
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error("could not locate pnpm-workspace.yaml above " + start);
}

const REPO_ROOT = findRepoRoot(__dirname);

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === "dist") continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (full.endsWith(".ts")) out.push(full);
  }
  return out;
}

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

function relative(full: string): string {
  return full.replace(/\\/g, "/").split("/GoalXI/").slice(-1)[0];
}

function exists(p: string): boolean {
  try {
    statSync(p);
    return true;
  } catch {
    return false;
  }
}
