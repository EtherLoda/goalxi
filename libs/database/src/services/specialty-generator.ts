/**
 * Specialty v2 generator.
 *
 * One roll decides three things at once:
 *   1. Does the player have a specialty at all?
 *      (outfield 50% No / GK 90% No)
 *   2. If yes, what tier?
 *      (outfield 5% Gold / 15% Silver / 30% Bronze;
 *       GK 1% Gold / 3% Silver / 6% Bronze — same 5/15/30 ratio
 *       within the 10% that have a spec)
 *   3. If yes, which code?                        (uniform over the active sub-pool
 *      matching the player's GK/outfield flag — see `getActivePool`)
 *
 * Position-aware (v2.4+): GK players only roll from `GK_SPECIALTIES`
 * (2 codes), outfield players only roll from `OUTFIELD_SPECIALTIES`
 * (10 codes). The two pools are disjoint, so a GK never rolls an
 * outfield code and vice versa. This replaces the v2.0
 * position-agnostic design where a CB could roll POACHER or a FW
 * could roll SAVING_MASTER — both of which produced specialty
 * assignments whose engine effects never fired in practice.
 *
 * Tier is **decoupled from player attributes** (v2.2+). The 5/15/30
 * distribution is a pure random roll, not derived from the primary
 * attribute value. See `docs/specialty-v2-design.md` §1.2.
 *
 * v2.8.1: GK specialty is 5× rarer (10% have any) per user
 * 2026-08-25. Rationale: GK is the rarest on-pitch slot, a GK
 * with a specialty should feel like a discovery. Per-code rate
 * stays the same (outfield 5/10 = 0.5% per code, GK 1/2 = 0.5%
 * per code) because the GK pool is 5× smaller.
 *
 * Pure function: takes a `rand` for testability. Default is
 * `Math.random`. Callers should pass a seeded RNG when reproducibility
 * matters (e.g. scout-generator with a fixed seed).
 */
import {
  ActiveCoreSpecialty,
  GOALKEEPER_TIER_DISTRIBUTION,
  SpecialtyTier,
  TIER_DISTRIBUTION,
  getActivePool,
} from '../constants/specialty-codes';

export interface SpecialtyRoll {
  code: ActiveCoreSpecialty;
  tier: SpecialtyTier;
}

/**
 * Roll a single player's specialty. Returns `null` for the
 * 50% (outfield) / 90% (GK) of players who have no specialty —
 * those go through the engine with no specialty hook attached,
 * just attribute-driven.
 *
 * `isGoalkeeper` is **required** for callers that know the player's
 * type. It defaults to `false` (outfield) for backwards compat with
 * existing call sites, but a future tripwire / lint rule will
 * enforce that the parameter is passed explicitly. New generator
 * call sites must pass it — passing the wrong value silently rolls
 * from the wrong pool (a GK caller that forgets to pass `true` will
 * roll an outfield code, which the engine will then treat as
 * "GK player with no GK-specific buff").
 */
export function rollSpecialty(
  rand: () => number = Math.random,
  isGoalkeeper: boolean = false,
): SpecialtyRoll | null {
  // v2.8.1: GK 走更稀的分布. The conditional tier ratio is the
  // same (Gold 1/10 = 10%, Silver 3/10 = 30%, Bronze 6/10 = 60%
  // of "has-spec" rolls) — only NO_SPEC ceiling differs.
  const dist = isGoalkeeper ? GOALKEEPER_TIER_DISTRIBUTION : TIER_DISTRIBUTION;

  // Single roll drives both the "has spec" decision and the tier.
  // Using one r keeps the boundaries aligned with §1.2:
  //   outfield: 0–50  → no spec, 50–55 → Gold, 55–70 → Silver, 70–100 → Bronze
  //   GK:       0–90  → no spec, 90–91 → Gold, 91–94 → Silver, 94–100 → Bronze
  const r = rand() * 100;
  if (r < dist.NO_SPEC) {
    return null;
  }

  let tier: SpecialtyTier;
  if (r < dist.NO_SPEC + dist.GOLD) {
    tier = 'GOLD';
  } else if (r < dist.NO_SPEC + dist.GOLD + dist.SILVER) {
    tier = 'SILVER';
  } else {
    tier = 'BRONZE';
  }

  // Uniform over the position-appropriate sub-pool. `Math.floor` is
  // safe because rand() returns [0, 1) and we multiply by pool length
  // — never out of range. The route goes through `getActivePool` so
  // a future pool change (e.g. splitting outfield by archetype) is a
  // one-line edit here rather than a hunt-and-replace.
  const pool = getActivePool(isGoalkeeper);
  const code = pool[Math.floor(rand() * pool.length)];
  return { code, tier };
}

/**
 * Same as `rollSpecialty` but with an explicit guarantee that the
 * returned roll carries a specialty. Useful for tests that want to
 * always exercise the non-null branch.
 *
 * Still goes through the real distribution (rerolls if the first
 * attempt was No-spec), so it doesn't bias the distribution.
 */
export function rollSpecialtyOrThrow(
  rand: () => number = Math.random,
  isGoalkeeper: boolean = false,
): SpecialtyRoll {
  for (let attempt = 0; attempt < 10; attempt++) {
    const r = rollSpecialty(rand, isGoalkeeper);
    if (r !== null) return r;
  }
  // Statistically impossible — 10 attempts at 50% No-spec each is a
  // 0.1% chance — but the strict return type forces us to handle it.
  // Pick the most common code in whichever pool we were asked for so
  // the fallback is at least type-correct.
  const fallback: ActiveCoreSpecialty = isGoalkeeper
    ? 'SAVING_MASTER'
    : 'PLAYMAKER';
  return { code: fallback, tier: 'BRONZE' };
}
