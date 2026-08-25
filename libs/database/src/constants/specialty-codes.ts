/**
 * Core specialty v2 — codes + tier multipliers + primary attribute map.
 *
 * The full design (engine hooks, tier distribution, generation logic) is
 * documented in `docs/specialty-v2-design.md`. This file is the
 * single source of truth for the *identifiers*; the engine package
 * imports the constants and the generator from here.
 *
 * Three pools:
 *   - `OUTFIELD_SPECIALTIES` (10): active codes rollable by outfield
 *     players only. CB / W / AM / etc. never roll a GK code.
 *   - `GK_SPECIALTIES` (2): active codes rollable by goalkeepers only.
 *     GK never rolls an outfield code.
 *   - `DEPRECATED_SPECIALTIES` (8): kept for legacy data and the
 *     `migrate-specialty-v2.ts` script. UI renders these as "已弃用".
 *     Generator never produces them.
 *
 * `ACTIVE_SPECIALTIES` is kept as the union of the two active
 * sub-pools for backwards compat with code that hasn't switched to
 * the position-aware path. New generator code must call
 * `getActivePool(isGoalkeeper)` instead of indexing `ACTIVE_SPECIALTIES`
 * directly — direct indexing silently bypasses the GK/outfield
 * separation. See `specialty-generator.ts` for the roll path.
 *
 * Tier distribution is **decoupled from player attributes** — see
 * `specialty-generator.ts` for the 5/15/30/50 random roll. This file
 * only carries the *post-roll* tier multipliers, used by the engine.
 */

// ────────────────────────────────────────────────────────────────────
// Active pool — outfield (10 codes)
// ────────────────────────────────────────────────────────────────────

export const OUTFIELD_SPECIALTIES = [
  'AERIAL_THREAT',
  'DRIBBLER',
  'PLAYMAKER',
  'TACKLER',
  'WALL',
  'SPEEDSTER',
  'CROSSER',
  'POACHER',
  'COMPOSED',
  'PHYSICAL_BEAST',
] as const;

export type OutfieldCoreSpecialty = (typeof OUTFIELD_SPECIALTIES)[number];

// ────────────────────────────────────────────────────────────────────
// Active pool — GK (2 codes)
// ────────────────────────────────────────────────────────────────────

export const GK_SPECIALTIES = [
  'SAVING_MASTER',
  'SWEEPER_KEEPER',
] as const;

export type GoalkeeperCoreSpecialty = (typeof GK_SPECIALTIES)[number];

// ────────────────────────────────────────────────────────────────────
// Active pool — combined (kept for legacy callers; new code should
// route through `getActivePool(isGoalkeeper)` instead).
// ────────────────────────────────────────────────────────────────────

export const ACTIVE_SPECIALTIES = [
  ...OUTFIELD_SPECIALTIES,
  ...GK_SPECIALTIES,
] as const;

export type ActiveCoreSpecialty = (typeof ACTIVE_SPECIALTIES)[number];

// ────────────────────────────────────────────────────────────────────
// Deprecated pool (8 codes) — read-only after migration
// ────────────────────────────────────────────────────────────────────

export const DEPRECATED_SPECIALTIES = [
  'LONG_SHOT',
  'POSITIONING_MASTER',
  'FIRST_TOUCH',
  'COUNTER_ATTACK',
  'BOX_TO_BOX',
  'SET_PIECE_MASTER',
  'REBOUND_KING',
  'TARGET_MAN',
] as const;

export type DeprecatedCoreSpecialty = (typeof DEPRECATED_SPECIALTIES)[number];

// Combined union (legacy data may carry any of the 20)
export type CoreSpecialtyCode = ActiveCoreSpecialty | DeprecatedCoreSpecialty;

// Runtime sets for O(1) membership checks
export const ACTIVE_SPECIALTY_SET: ReadonlySet<string> = new Set(ACTIVE_SPECIALTIES);
export const OUTFIELD_SPECIALTY_SET: ReadonlySet<string> = new Set(OUTFIELD_SPECIALTIES);
export const GK_SPECIALTY_SET: ReadonlySet<string> = new Set(GK_SPECIALTIES);
export const DEPRECATED_SPECIALTY_SET: ReadonlySet<string> = new Set(DEPRECATED_SPECIALTIES);

/**
 * Return the active specialty pool a player of the given type is
 * allowed to roll from. This is the only sanctioned entry point for
 * generator code — direct `ACTIVE_SPECIALTIES[...]` indexing
 * silently bypasses the GK/outfield separation and is the regression
 * we're guarding against. The `readonly` return type stops callers
 * from mutating the underlying arrays.
 */
export function getActivePool(
  isGoalkeeper: boolean,
): readonly ActiveCoreSpecialty[] {
  return isGoalkeeper ? GK_SPECIALTIES : OUTFIELD_SPECIALTIES;
}

/**
 * Type guards. Use these instead of `ACTIVE_SPECIALTY_SET.has(code)`
 * inline so the type-narrowing carries through to the call site.
 */
export function isActiveSpecialty(code: string | null | undefined): code is ActiveCoreSpecialty {
  return code != null && ACTIVE_SPECIALTY_SET.has(code);
}

export function isDeprecatedSpecialty(
  code: string | null | undefined,
): code is DeprecatedCoreSpecialty {
  return code != null && DEPRECATED_SPECIALTY_SET.has(code);
}

export function isKnownSpecialty(code: string | null | undefined): code is CoreSpecialtyCode {
  return code != null && (ACTIVE_SPECIALTY_SET.has(code) || DEPRECATED_SPECIALTY_SET.has(code));
}

// ────────────────────────────────────────────────────────────────────
// Tier system
// ────────────────────────────────────────────────────────────────────

export const SPECIALTY_TIERS = ['GOLD', 'SILVER', 'BRONZE'] as const;
export type SpecialtyTier = (typeof SPECIALTY_TIERS)[number];

/**
 * Multiplier applied to a specialty's base effect by tier.
 *   GOLD   = ×1.4
 *   SILVER = ×1.0
 *   BRONZE = ×0.7
 *
 * Picked as "Gold is the headline stat" — a Gold specialty is
 * noticeably stronger than the documented Silver baseline, and Bronze
 * is a noticeable downgrade. See §1.2 of the design doc.
 */
export const TIER_MULTIPLIERS: Record<SpecialtyTier, number> = {
  GOLD: 1.4,
  SILVER: 1.0,
  BRONZE: 0.7,
};

/**
 * Tier probability distribution at player generation time.
 * 50% of players get NO specialty. Of the 50% that do, tier
 * distribution is 5/15/30 (Gold/Silver/Bronze).
 *
 * This is the **outfield** distribution. Goalkeepers use
 * `GOALKEEPER_TIER_DISTRIBUTION` below — only 10% of GKs have a
 * specialty, because the goalkeeper is the rarest on-pitch slot
 * and a GK with a specialty should feel like a discovery.
 *
 * See §1.2 of the design doc for the rationale ("5% Gold  = 1 in
 * 20 is rare-but-not-vanishing; 50% No spec makes finding one
 * feel like discovery").
 */
export const TIER_DISTRIBUTION = {
  GOLD: 5,
  SILVER: 15,
  BRONZE: 30,
  NO_SPEC: 50,
} as const;

/**
 * Goalkeeper-specific tier probability distribution. User
 * 2026-08-25 request: GK specialty should be **5× rarer than
 * outfield** (10% have any spec, vs 50% outfield). The conditional
 * split within "has a spec" stays the same 5/15/30 ratio — only
 * the NO_SPEC ceiling changes (50% → 90%).
 *
 * Trade-off vs `TIER_DISTRIBUTION`:
 *   - Has-spec rate: outfield 50% vs GK 10% (5× rarer)
 *   - Tier condition化: outfield Gold 10% / Silver 30% / Bronze 60%
 *     — GK 同样 Gold 10% / Silver 30% / Bronze 60% (ratio 维持)
 *   - Per-code: outfield 5/10 = 0.5% / GK 1/2 = 0.5% (同 — 因为
 *     pool 大小差 5x 抵消 has-spec 5x 差距)
 *   - Gold GK: outfield 2.5% (5% × 1/2) vs GK 0.5% (1% × 1/2) — GK Gold
 *     是 5x rarer, "1 in 200" 极稀, 但仍 not impossible。
 */
export const GOALKEEPER_TIER_DISTRIBUTION = {
  GOLD: 1,
  SILVER: 3,
  BRONZE: 6,
  NO_SPEC: 90,
} as const;

// ────────────────────────────────────────────────────────────────────
// Primary attribute map (debug / UI tooltip only — NOT used for tier
// calculation since v2.2). Kept here so a future "attribute vs tier
// mismatch" UI indicator has a single source of truth.
// ────────────────────────────────────────────────────────────────────

/**
 * For each specialty, the "primary" attribute that conceptually
 * powers it. v2.2+ this is purely informational — the actual tier
 * is a random roll, not derived from this attribute's value.
 *
 * Engine callers should use `SpecialtySystem` instead of reading
 * this map directly.
 */
export const CORE_SPECIALTY_PRIMARY_ATTRIBUTE: Record<CoreSpecialtyCode, string> = {
  // Active
  AERIAL_THREAT: 'strength',
  DRIBBLER: 'dribbling',
  PLAYMAKER: 'passing',
  TACKLER: 'defending',
  WALL: 'defending',
  SPEEDSTER: 'pace',
  CROSSER: 'passing',
  POACHER: 'positioning',
  COMPOSED: 'composure',
  PHYSICAL_BEAST: 'strength',
  SAVING_MASTER: 'gk_reflexes',
  SWEEPER_KEEPER: 'positioning',
  // Deprecated
  LONG_SHOT: 'finishing',
  POSITIONING_MASTER: 'positioning',
  FIRST_TOUCH: 'composure',
  COUNTER_ATTACK: 'pace',
  BOX_TO_BOX: 'pace',
  SET_PIECE_MASTER: 'freeKicks',
  REBOUND_KING: 'positioning',
  TARGET_MAN: 'strength',
};
