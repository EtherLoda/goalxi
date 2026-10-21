/**
 * Where the promotion / relegation cut-offs sit for one league.
 *
 * Kept out of the table component because every number here is a per-league
 * column (`league.max_teams`, `promotion_slots`, `playoff_slots`,
 * `relegation_slots`) and getting one of them wrong is invisible in a render
 * test but wrong for the reader. Pure functions, so the jest node environment
 * can test them without a DOM.
 */
export interface LeagueZoneModel {
  /** 1 = top flight. */
  tier: number;
  /** Deepest tier in the pyramid. `tier === tierCount` means the bottom. */
  tierCount: number;
  maxTeams: number;
  promotionSlots: number;
  playoffSlots: number;
  relegationSlots: number;
}

export type LeagueZone = "promote" | "promotePlayoff" | "relPlayoff" | "rel";

/**
 * Fallback used only when a caller forgets to pass the model. It describes a
 * generic middle division: the markers degrade to "approximately right"
 * instead of vanishing, which is easier to notice and fix than an empty
 * column.
 */
const FALLBACK: LeagueZoneModel = {
  tier: 2,
  tierCount: 3,
  maxTeams: 16,
  promotionSlots: 1,
  playoffSlots: 4,
  relegationSlots: 4,
};

export function resolveZoneModel(
  model: LeagueZoneModel | null | undefined,
  rowCount: number,
): LeagueZoneModel {
  const maxTeams =
    model?.maxTeams && model.maxTeams > 0 ? model.maxTeams : rowCount || 16;

  return {
    tier: model?.tier ?? FALLBACK.tier,
    tierCount: model?.tierCount ?? FALLBACK.tierCount,
    maxTeams,
    promotionSlots: model?.promotionSlots ?? FALLBACK.promotionSlots,
    playoffSlots: model?.playoffSlots ?? FALLBACK.playoffSlots,
    relegationSlots: model?.relegationSlots ?? FALLBACK.relegationSlots,
  };
}

/**
 * The zone a finishing position falls into, or null for "nothing happens".
 *
 * The arithmetic mirrors the settlement workers, not football intuition:
 *
 * - Only the CHAMPION goes up directly (`position <= promotionSlots`) and it
 *   swaps with the upper league's relegation-zone club 1:1. The top flight
 *   has nobody above it, so its first place is not a promotion.
 * - Second place enters the promotion playoff (`playoff.service` pairs it
 *   with the upper league's 9th-12th).
 * - The upper league's `maxTeams - relegationSlots - playoffSlots + 1` down to
 *   `maxTeams - relegationSlots` is the same playoff seen from above, i.e. a
 *   RELEGATION playoff. For the default 16/4/4 shape that is 9th-12th.
 * - The bottom `relegationSlots` go down directly — except in the bottom
 *   tier, where there is nowhere to fall to.
 */
export function zoneForPosition(
  position: number,
  model: LeagueZoneModel | null | undefined,
  rowCount: number,
): LeagueZone | null {
  const m = resolveZoneModel(model, rowCount);

  const hasTierAbove = m.tier > 1;
  const hasTierBelow = m.tier < m.tierCount;

  const relegationStart = m.maxTeams - m.relegationSlots + 1;
  const playoffStart = relegationStart - m.playoffSlots;

  if (hasTierAbove && position <= m.promotionSlots) {
    return "promote";
  }
  if (hasTierAbove && position === 2) {
    return "promotePlayoff";
  }
  if (hasTierBelow && position >= playoffStart && position < relegationStart) {
    return "relPlayoff";
  }
  if (hasTierBelow && position >= relegationStart) {
    return "rel";
  }
  return null;
}

/**
 * The legends worth printing for this league, in table order. A top-flight
 * table has no promotion to explain and a bottom-tier table has no relegation,
 * so advertising all four everywhere would describe someone else's league.
 */
export function zonesPresent(
  model: LeagueZoneModel | null | undefined,
  rowCount: number,
): LeagueZone[] {
  const m = resolveZoneModel(model, rowCount);
  const zones: LeagueZone[] = [];

  if (m.tier > 1) zones.push("promote", "promotePlayoff");
  if (m.tier < m.tierCount) zones.push("relPlayoff", "rel");

  return zones;
}
