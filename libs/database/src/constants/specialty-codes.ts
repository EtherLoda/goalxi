/**
 * Core specialty v2 — codes + tier multipliers + primary attribute map.
 *
 * The full design (engine hooks, tier distribution, generation logic) is
 * documented in `docs/specialty-v2-design.md`. This file is the
 * single source of truth for the *identifiers*; the engine package
 * imports the constants and the generator from here.
 *
 * Two pools:
 *   - `ACTIVE_SPECIALTIES` (12): the generator rolls from this pool. New
 *     players are never given a deprecated code.
 *   - `DEPRECATED_SPECIALTIES` (8): kept for legacy data and the
 *     `migrate-specialty-v2.ts` script. UI renders these as "已弃用".
 *
 * Tier distribution is **decoupled from player attributes** — see
 * `specialty-generator.ts` for the 5/15/30/50 random roll. This file
 * only carries the *post-roll* tier multipliers, used by the engine.
 */

// ────────────────────────────────────────────────────────────────────
// Active pool (12 codes)
// ────────────────────────────────────────────────────────────────────

export const ACTIVE_SPECIALTIES = [
  // Outfield (10)
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
  // GK (2)
  'SAVING_MASTER',
  'SWEEPER_KEEPER',
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
export const DEPRECATED_SPECIALTY_SET: ReadonlySet<string> = new Set(DEPRECATED_SPECIALTIES);

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
