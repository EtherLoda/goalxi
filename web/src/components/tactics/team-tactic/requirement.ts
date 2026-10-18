/**
 * requirement.ts — the client-side half of the team-tactic deployment gate.
 *
 * Everything here is a pure function over the lineup and the definition
 * table the server serves (`GET /game/team-tactics`). Keeping it pure means
 * the tally can be recomputed on every drag with a plain `useMemo`, and the
 * rules can be unit-tested without mounting anything.
 *
 * It is NOT a second implementation of the gate: the server validates with
 * `checkTacticRequirement` before persisting, and the client only uses this
 * to grey out a tactic early so the player is not told "no" after a submit.
 */
import type {
  PositionFamilyCode,
  TeamTacticDefinition,
  TeamTacticRequirement,
} from '@/lib/api';
import type { LineupMap, TeamTacticCodeValue } from '../types';

/** How many slots of each family the current lineup fields. */
export type FamilyTally = Record<PositionFamilyCode, number>;

const EMPTY_TALLY: FamilyTally = {
  GK: 0,
  CB: 0,
  FB: 0,
  DM: 0,
  CM: 0,
  AM: 0,
  W: 0,
  CF: 0,
};

/**
 * Count the lineup by position family.
 *
 * Empty slots (`null`/`undefined`) do not count. Slots whose key is not in
 * the mapping are skipped rather than guessed — a typo in a slot name must
 * not silently satisfy a requirement.
 */
export function tallyFamilies(
  lineup: LineupMap,
  families: Record<string, PositionFamilyCode>,
): FamilyTally {
  const tally: FamilyTally = { ...EMPTY_TALLY };
  for (const [slot, playerId] of Object.entries(lineup)) {
    if (playerId === null || playerId === undefined) continue;
    const family = families[slot];
    if (!family) continue;
    tally[family] += 1;
  }
  return tally;
}

/** One unmet clause, phrased as "need N more of these families". */
export interface MissingRequirement {
  families: PositionFamilyCode[];
  need: number;
  have: number;
}

/**
 * Which clauses of `requirements` the tally cannot satisfy.
 *
 * The clauses of a tactic never compete for the same family, so a plain
 * per-clause comparison is exact — no assignment search is needed. If a
 * future tactic does share a family between clauses this must become a
 * matching problem, which is why the coupling is called out here.
 */
export function missingRequirements(
  tally: FamilyTally,
  requirements: readonly TeamTacticRequirement[],
): MissingRequirement[] {
  const missing: MissingRequirement[] = [];
  for (const requirement of requirements) {
    const have = requirement.families.reduce(
      (sum, family) => sum + tally[family],
      0,
    );
    if (have < requirement.count) {
      missing.push({
        families: [...requirement.families],
        need: requirement.count,
        have,
      });
    }
  }
  return missing;
}

/** The definition for a code, or `undefined` when the server did not serve it. */
export function findTactic(
  code: TeamTacticCodeValue,
  definitions: readonly TeamTacticDefinition[],
): TeamTacticDefinition | undefined {
  return definitions.find((definition) => definition.code === code);
}

export interface TacticCheck {
  /** True when no tactic is selected, or the selected one can be fielded. */
  ok: boolean;
  missing: MissingRequirement[];
}

/**
 * Can this lineup field `tactic`?
 *
 * `null` (no tactic) is always satisfiable — it is a real choice, not an
 * absent one. When the definition table has not loaded yet we report `ok`
 * so a load race cannot block a valid submit; the server remains the
 * authority either way.
 */
export function checkTactic(
  lineup: LineupMap,
  tactic: TeamTacticCodeValue | null,
  response: { families: Record<string, PositionFamilyCode>; tactics: TeamTacticDefinition[] } | null,
): TacticCheck {
  if (!tactic || !response) return { ok: true, missing: [] };
  const definition = findTactic(tactic, response.tactics);
  if (!definition) return { ok: true, missing: [] };
  const missing = missingRequirements(
    tallyFamilies(lineup, response.families),
    definition.requirements,
  );
  return { ok: missing.length === 0, missing };
}
