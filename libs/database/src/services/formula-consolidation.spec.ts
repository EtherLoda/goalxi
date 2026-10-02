import { readdirSync, readFileSync, statSync } from "fs";
import { join } from "path";

/**
 * Tripwire for the Phase 3 consolidation.
 *
 * ## The failure mode this prevents
 *
 * Six formulas lived in two or three copies each across
 * `api/`, `settlement/` and `libs/database/`, and the copies had
 * diverged:
 *
 *   - `calculatePotentialAbility` — three implementations. Two of them
 *     omitted the goalkeeper branch and therefore capped every keeper at
 *     PA 86 out of a possible 100.
 *   - potential tier labels — a five-step product scale and a nine-step
 *     internal scale both reached the same API field; the UI sorts on
 *     five names only.
 *   - `hashPassword` — two implementations, one of which wrote the full
 *     argon2 error object to stdout on every failed login.
 *   - `SEAT_DEMOLISH_REFUND_RATE`, the `tierDistribution` literal — each
 *     defined twice / three times.
 *
 * Nothing in the type system or the compiler caught any of it, and the
 * unit tests for the call sites passed throughout: they asserted that a
 * local copy was called, not that the copy was correct.
 *
 * ## How this works
 *
 * It scans the source for re-introductions rather than trying to compare
 * behaviour. That is the same technique as
 * `settlement/src/processors/processor-wiring.spec.ts`, and it is
 * deliberately crude — these are textual invariants, not semantic ones.
 */
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

/** Packages that are allowed to host the canonical implementation. */
const CANONICAL_HOSTS = ["libs/database/src"];

/**
 * Files permitted to mention these identifiers outside the canonical
 * host. Each entry is `dir + '/' + file`; the reason is recorded so a
 * future reader can tell a deliberate exception from an oversight.
 */
const ALLOWED_EXCEPTIONS: Record<string, string[]> = {
  calculatePotentialAbility: [
    // Thin re-export kept so `scouts.service` keeps importing from the
    // api's own utils module; the body is a one-line delegation.
    "api/src/utils/player-generator.ts",
  ],
  derivePotentialTier: [],
  determineTier: [
    // Reports the internal generation band; still used by
    // `player-generator` callers that want the nine-step label.
    "api/src/utils/player-generator.ts",
  ],
  hashPassword: [],
  verifyPassword: [],
  SEAT_DEMOLISH_REFUND_RATE: [],
  DEFAULT_TIER_DISTRIBUTION: [],
};

interface Offender {
  file: string;
  symbol: string;
  reason: string;
}

describe("domain formula consolidation (wiring tripwire)", () => {
  const offenders: Offender[] = [];

  for (const [symbol, allowed] of Object.entries(ALLOWED_EXCEPTIONS)) {
    // Match a DECLARATION, not a mention. Importing the canonical symbol
    // is the desired end state, so a bare identifier search would flag
    // every correct call site — which is exactly the false positive this
    // first draft produced.
    const re = new RegExp(
      [
        `(?:export\\s+)?(?:async\\s+)?function\\s+${symbol}\\b`, // function decl
        `(?:export\\s+)?const\\s+${symbol}\\s*=`, // const / arrow fn
        `(?:export\\s+)?(?:enum|type|interface)\\s+${symbol}\\b`, // type decl
        `(?:public|private|protected)?\\s*${symbol}\\s*\\([^)]*\\)\\s*[:{]`, // method
      ].join("|"),
      "m",
    );

    for (const file of walk(join(REPO_ROOT, "api/src")).concat(
      walk(join(REPO_ROOT, "settlement/src")),
      walk(join(REPO_ROOT, "simulator/src")),
      walk(join(REPO_ROOT, "libs/database/src")),
    )) {
      const rel = relative(file);
      if (allowed.includes(rel)) continue;
      if (CANONICAL_HOSTS.some((h) => rel.startsWith(h))) continue;
      if (rel.endsWith(".spec.ts")) continue;

      if (re.test(stripComments(readFileSync(file, "utf8")))) {
        offenders.push({
          file: rel,
          symbol,
          reason:
            "declares its own copy — import it from @goalxi/database instead",
        });
      }
    }
  }

  it("found the source tree to scan (sanity check on the walk)", () => {
    expect(walk(join(REPO_ROOT, "api/src")).length).toBeGreaterThan(50);
  });

  it("no consolidated formula is re-implemented outside libs/database", () => {
    expect(
      offenders.map((o) => `${o.symbol} in ${o.file} — ${o.reason}`),
    ).toEqual([]);
  });

  it("every allow-listed exception still points at a file that exists", () => {
    // Guards against an exception list quietly outliving the file it was
    // written for, which would silently stop being an exception.
    const stale: string[] = [];
    for (const list of Object.values(ALLOWED_EXCEPTIONS)) {
      for (const rel of list) {
        if (!exists(join(REPO_ROOT, rel))) stale.push(rel);
      }
    }
    expect(stale).toEqual([]);
  });
});

/**
 * Independent definition check for the two constants that were defined
 * twice with the same value. A duplicate would be a silent divergence
 * the moment either side is edited.
 */
describe("single-valued constants", () => {
  const DUPLICATED_ONCE = ["SEAT_DEMOLISH_REFUND_RATE"];
  const DISTRIBUTED = ["DEFAULT_TIER_DISTRIBUTION"];

  it("each constant is assigned in exactly one place", () => {
    const dupes: string[] = [];

    for (const symbol of [...DUPLICATED_ONCE, ...DISTRIBUTED]) {
      const re = new RegExp(`^\\s*(?:export\\s+)?const\\s+${symbol}\\b`, "m");
      const sites: string[] = [];

      for (const file of walk(join(REPO_ROOT, "api/src")).concat(
        walk(join(REPO_ROOT, "settlement/src")),
        walk(join(REPO_ROOT, "simulator/src")),
        walk(join(REPO_ROOT, "libs/database/src")),
      )) {
        if (!re.test(readFileSync(file, "utf8"))) continue;
        sites.push(relative(file));
      }

      if (sites.length !== 1) {
        dupes.push(`${symbol} declared ${sites.length}x: ${sites.join(", ")}`);
      }
    }

    expect(dupes).toEqual([]);
  });
});

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
