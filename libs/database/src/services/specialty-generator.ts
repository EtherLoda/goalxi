/**
 * Specialty v2 generator.
 *
 * One roll decides three things at once:
 *   1. Does the player have a specialty at all?  (50% No)
 *   2. If yes, what tier?                         (5% Gold / 15% Silver / 30% Bronze)
 *   3. If yes, which code?                        (uniform over 12 active codes)
 *
 * Position-agnostic: any player at any position has equal odds. The
 * engine applies effects only when relevant events fire, so a CB
 * rolling POACHER isn't "wrong" — POACHER just rarely fires for him.
 *
 * Tier is **decoupled from player attributes** (v2.2+). The 5/15/30
 * distribution is a pure random roll, not derived from the primary
 * attribute value. See `docs/specialty-v2-design.md` §1.2.
 *
 * Pure function: takes a `rand` for testability. Default is
 * `Math.random`. Callers should pass a seeded RNG when reproducibility
 * matters (e.g. scout-generator with a fixed seed).
 */
import {
  ACTIVE_SPECIALTIES,
  ActiveCoreSpecialty,
  SpecialtyTier,
  TIER_DISTRIBUTION,
} from '../constants/specialty-codes';

export interface SpecialtyRoll {
  code: ActiveCoreSpecialty;
  tier: SpecialtyTier;
}

/**
 * Roll a single player's specialty. Returns `null` for the 50% of
 * players who have no specialty — those go through the engine with no
 * specialty hook attached, just attribute-driven.
 */
export function rollSpecialty(rand: () => number = Math.random): SpecialtyRoll | null {
  // Single roll drives both the "has spec" decision and the tier.
  // Using one r keeps the boundaries aligned with §1.2:
  //   0–50  → no spec
  //   50–55 → Gold
  //   55–70 → Silver
  //   70–100 → Bronze
  const r = rand() * 100;
  if (r < TIER_DISTRIBUTION.NO_SPEC) {
    return null;
  }

  let tier: SpecialtyTier;
  if (r < TIER_DISTRIBUTION.NO_SPEC + TIER_DISTRIBUTION.GOLD) {
    tier = 'GOLD';
  } else if (
    r <
    TIER_DISTRIBUTION.NO_SPEC + TIER_DISTRIBUTION.GOLD + TIER_DISTRIBUTION.SILVER
  ) {
    tier = 'SILVER';
  } else {
    tier = 'BRONZE';
  }

  // Uniform over the active pool. `Math.floor` is safe because rand()
  // returns [0, 1) and we multiply by pool length — never out of range.
  const code = ACTIVE_SPECIALTIES[Math.floor(rand() * ACTIVE_SPECIALTIES.length)];
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
export function rollSpecialtyOrThrow(rand: () => number = Math.random): SpecialtyRoll {
  for (let attempt = 0; attempt < 10; attempt++) {
    const r = rollSpecialty(rand);
    if (r !== null) return r;
  }
  // Statistically impossible — 10 attempts at 50% No-spec each is a
  // 0.1% chance — but the strict return type forces us to handle it.
  return { code: 'PLAYMAKER', tier: 'BRONZE' };
}
