import type { PlayerSkills } from "../entities/player.entity";

/**
 * The single source of truth for how potential is turned into a number
 * and a label.
 *
 * ## Why this file exists
 *
 * Both of these were computed in several places at once, and the copies
 * had drifted:
 *
 *   - `api/src/api/player/player.service.ts` had a private
 *     `calculatePotentialAbility`
 *   - `api/src/utils/player-generator.ts` exported a second one
 *   - `libs/database/src/services/team-onboarding-generator.ts` had a
 *     third, explicitly commented as a "mirror" of the first
 *
 * The two group copies differed from the generator copy in one way that
 * mattered: **the generator copy scaled goalkeepers by 120 and the other
 * two used 140 for everyone.** A keeper's best possible raw score is
 * `2x20 physical + 3x20 technical + 2x20x0.4 mental + 2x20x0.1 setPieces
 * = 120`, so dividing by 140 capped every goalkeeper at
 * `120/140 = 85.7` — no keeper could ever be rated above 86 potential,
 * however good. The two copies that omitted the branch were
 * `PlayerService` (used when a manager edits a player) and
 * `team-onboarding-generator` (used for every generated team).
 *
 * ## Two scales, deliberately
 *
 * `PlayerTier` in `api/src/utils/player-generator.ts` is a NINE-step
 * label used only to pick a target PA while generating a player (see
 * `TIER_MEANS`). It is an internal generation knob.
 *
 * `PotentialTier` below is the FIVE-step product scale. It is the one
 * that reaches the API and the UI, and it is what
 * `web/src/app/[locale]/youth/squad/page.tsx` sorts on. CLAUDE.md lists
 * exactly these five names under the labels that may appear in
 * player-facing copy.
 *
 * Do not let the two leak into each other — see the note on
 * `derivePotentialTier`.
 */

/**
 * Product-facing potential band. These five strings are what the
 * frontend renders and sorts by, so they are load-bearing API values,
 * not cosmetic text.
 */
export enum PotentialTier {
  LEGEND = "LEGEND",
  ELITE = "ELITE",
  HIGH_PRO = "HIGH_PRO",
  REGULAR = "REGULAR",
  LOW = "LOW",
}

/**
 * Lower bound of each band, descending. The last entry is the floor, so
 * every PA maps to exactly one tier.
 *
 * These thresholds predate this file (they lived in a private function
 * inside `scouts.controller.ts`) and are unchanged by the move.
 */
export const POTENTIAL_TIER_THRESHOLDS: ReadonlyArray<
  readonly [number, PotentialTier]
> = [
  [91, PotentialTier.LEGEND],
  [81, PotentialTier.ELITE],
  [71, PotentialTier.HIGH_PRO],
  [56, PotentialTier.REGULAR],
] as const;

/** Returned for any PA below the lowest threshold. */
export const POTENTIAL_TIER_FLOOR: PotentialTier = PotentialTier.LOW;

/**
 * Map a potential ability to its product band.
 *
 * `scouts.controller.ts` used this for youth players while
 * `scouts.service.ts` stored the internal nine-step `PlayerTier` in the
 * same API field. The frontend sorts by the five-step scale, so a
 * candidate labelled `SUPERSTAR` / `ROTATION` / `PROSPECT` resolved to
 * `tierOrder[label] ?? 0` and sank to the bottom of the squad list while
 * displaying a badge outside the design system. Both paths now come
 * through here.
 */
export function derivePotentialTier(pa: number): PotentialTier {
  for (const [threshold, tier] of POTENTIAL_TIER_THRESHOLDS) {
    if (pa >= threshold) return tier;
  }
  return POTENTIAL_TIER_FLOOR;
}

/**
 * How often each band is drawn when generating a prospect.
 *
 * This literal was copy-pasted verbatim into three call sites
 * (`scouts.service`, `scout-scheduler.service`,
 * `senior-scout-generator`). They drifted apart in every OTHER field of
 * the same call — different `algorithm`, different PA range — which is
 * exactly what happens when only one field is shared by copy-paste
 * rather than by reference.
 */
export const DEFAULT_TIER_DISTRIBUTION: Readonly<
  Record<PotentialTier, number>
> = Object.freeze({
  LEGEND: 0.005,
  ELITE: 0.015,
  HIGH_PRO: 0.05,
  REGULAR: 0.43,
  LOW: 0.5,
});

/**
 * Weights applied to each skill group. Physical and technical count
 * full; mental is discounted; set pieces are near-irrelevant.
 */
const PA_GROUP_WEIGHTS = {
  physical: 1,
  technical: 1,
  mental: 0.4,
  setPieces: 0.1,
} as const;

/**
 * Best achievable raw score, which depends on how many technical skills
 * the player type has.
 *
 * Outfield has 4 technical skills, keeper has 3 (`GKTechnical` omits
 * `positioning`, which a keeper reads from `mental`), so a keeper's
 * ceiling is lower and the divisor has to match or keepers are
 * permanently capped.
 */
const PA_MAX_RAW = {
  outfield:
    2 * 20 +
    4 * 20 +
    2 * 20 * PA_GROUP_WEIGHTS.mental +
    2 * 20 * PA_GROUP_WEIGHTS.setPieces,
  goalkeeper:
    2 * 20 +
    3 * 20 +
    2 * 20 * PA_GROUP_WEIGHTS.mental +
    2 * 20 * PA_GROUP_WEIGHTS.setPieces,
} as const;

/** PA is reported on this scale; anything below the floor is clamped. */
export const PA_MIN = 5;
export const PA_MAX = 100;

function sumGroup(group: unknown): number {
  if (!group || typeof group !== "object") return 0;
  return Object.values(group as Record<string, unknown>).reduce<number>(
    (sum, value) => (typeof value === "number" ? sum + value : sum),
    0,
  );
}

/**
 * Potential ability (0-100) from a player's potential skills.
 *
 * `rawPA = Σphysical + Σtechnical + 0.4·Σmental + 0.1·ΣsetPieces`,
 * normalised by the ceiling for the player's type.
 *
 * @param skills the player's potential skill block. `null`/undefined
 *   yields {@link PA_MIN} rather than throwing, because this runs on
 *   partially-populated JSONB during generation and on imported rows.
 * @param isGoalkeeper must be supplied by the caller. It cannot be
 *   inferred from `skills` alone: a keeper and an outfielder can both
 *   have a `technical` object, and the only distinguishing key
 *   (`reflexes` vs `finishing`) is a runtime detail this function
 *   should not guess at. Getting it wrong caps keepers at 86.
 */
export function calculatePotentialAbility(
  skills: PlayerSkills | null | undefined,
  isGoalkeeper: boolean,
): number {
  if (!skills) return PA_MIN;

  const rawPA =
    sumGroup(skills.physical) * PA_GROUP_WEIGHTS.physical +
    sumGroup(skills.technical) * PA_GROUP_WEIGHTS.technical +
    sumGroup(skills.mental) * PA_GROUP_WEIGHTS.mental +
    sumGroup(skills.setPieces) * PA_GROUP_WEIGHTS.setPieces;

  const maxRaw = isGoalkeeper ? PA_MAX_RAW.goalkeeper : PA_MAX_RAW.outfield;
  if (maxRaw <= 0) return PA_MIN;

  const pa = Math.round((rawPA / maxRaw) * PA_MAX);
  return Math.min(PA_MAX, Math.max(PA_MIN, pa));
}

/**
 * The two ceilings, exported for specs that assert keepers are not
 * capped. Exposed rather than inlined so a test can state the expected
 * maximum without restating the arithmetic.
 */
export const PA_CEILING = {
  outfield: PA_MAX,
  goalkeeper: PA_MAX,
} as const;
