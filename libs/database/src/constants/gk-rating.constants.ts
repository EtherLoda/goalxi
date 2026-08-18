/**
 * Goalkeeper rating coefficients — single source of truth.
 *
 * Three engine paths historically maintained their own rating
 * formula for goalkeepers, with three different coefficient
 * vectors and three different output scales. This file pins
 * one set of coefficients and exports a small helper that all
 * three call sites share.
 *
 * Coefficient vector
 * ==================
 *   gk_reflexes:  4
 *   gk_handling:  2.5
 *   positioning:  1.5
 *   gk_aerial:    1
 *   composure:    1
 *   total:        10
 *
 * The 4 / 2.5 / 1.5 / 1 / 1 vector was the original engine-side
 * weight (set in `simulator/.../attribute-calculator.ts:273-284`).
 * The legacy `position-fit.util.ts` `GK_WEIGHTS` table used a
 * different 5 / 3 / 2 vector with only 3 attributes — that's the
 * bug commit 5 of the position-key unification plan fixes.
 *
 * Output scale per call site
 * ==========================
 * The three call sites still produce different output ranges by
 * design — they feed different downstream formulas that have
 * different magnitude expectations:
 *
 *   - engine `saveRating` (shot path)            → 0-200 raw
 *     (no scaling; the formula is a linear sum. Downstream
 *      `duelProbability` compares it against the shooter's
 *      0-200 rating in the same anchor space.)
 *
 *   - engine `setPieceGKRating` (set-piece path)  → 0-20
 *     (sum / 10. The set-piece formula gives the GK 20% of the
 *      defender weight — keeping the rating in the same 0-20
 *      ballpark as the `freeKicks` attribute means the 20%
 *      weight is a true 20% rather than a confusing
 *      'gk-quality × 0.2' magnitude artifact. The historical
 *      /9 divisor shrank it into 1-22 which made the GK look
 *      useless on corner kicks; the /10 keeps the design
 *      intent — GK is a 20% factor — visible in the math.)
 *
 *   - position-fit `fit`                          → 0-100
 *     (sum / total_weight. The position-fit report's
 *      'perfect fit' marker is 100; an attribute set that
 *      hits the coefficient vector exactly scores 100%.)
 *
 * Why one coefficient vector, three output ranges
 * =================================================
 * The coefficient vector is the *physical* claim: "a goalkeeper
 * who is 1 point better at reflexes contributes 4× as much to
 * their save rating as a goalkeeper who is 1 point better at
 * composure." That claim must be the same whether you're asking
 * 'will this goalkeeper save a penalty?' (engine path) or
 * 'how good a fit is this player for the GK slot?' (position-fit
 * path). Splitting the vector across three call sites let the
 * claim drift.
 *
 * The output scale, by contrast, is a *display* choice. Each
 * downstream consumer has a different scale expectation and
 * re-anchoring all of them to 0-100 would change the empirical
 * shot / set-piece / fit distributions in ways the project has
 * not measured. So the helper exposes three pre-scaled accessors
 * and a raw sum, and each call site picks the one it needs.
 */
export const GK_RATING_COEFFICIENTS = {
    gk_reflexes: 4,
    gk_handling: 2.5,
    positioning: 1.5,
    gk_aerial: 1,
    composure: 1,
} as const;

/**
 * Sum of the coefficient vector. Used to normalise the rating
 * to the 0-100 position-fit range (sum / total) and to the
 * 0-20 set-piece range (sum / 10). The engine path returns the
 * raw sum (0-200) — no division.
 */
export const GK_RATING_TOTAL_WEIGHT = 10 as const;

/**
 * The five goalkeeper-relevant attribute names, in coefficient
 * order. Useful for the position-fit report (which iterates a
 * known attribute set rather than guessing) and for future spec
 * coverage of the 5-attribute contract.
 */
export const GK_RATING_ATTRIBUTE_KEYS = [
    'gk_reflexes',
    'gk_handling',
    'positioning',
    'gk_aerial',
    'composure',
] as const;

export type GkRatingAttributeKey = (typeof GK_RATING_ATTRIBUTE_KEYS)[number];

/**
 * Raw GK rating: linear sum of the coefficient vector, no
 * division. This is the canonical 0-200 score the engine
 * compare against the shooter's 0-200 rating. Callers that
 * need a different scale should use `gkSetPieceRating` or
 * `gkPositionFit` below.
 *
 * Missing attributes (undefined) default to 0, matching the
 * historical behavior of the engine-side formula. A goalkeeper
 * with all five attributes at 0 scores 0; with all five at the
 * engine-side max of 20 scores 200.
 */
export function gkRawRating(attrs: {
    gk_reflexes?: number;
    gk_handling?: number;
    positioning?: number;
    gk_aerial?: number;
    composure?: number;
}): number {
    return (
        (attrs.gk_reflexes ?? 0) * GK_RATING_COEFFICIENTS.gk_reflexes +
        (attrs.gk_handling ?? 0) * GK_RATING_COEFFICIENTS.gk_handling +
        (attrs.positioning ?? 0) * GK_RATING_COEFFICIENTS.positioning +
        (attrs.gk_aerial ?? 0) * GK_RATING_COEFFICIENTS.gk_aerial +
        (attrs.composure ?? 0) * GK_RATING_COEFFICIENTS.composure
    );
}

/**
 * Set-piece-path GK rating. Same coefficient vector, divided
 * by 10 so the result lands in the 0-20 ballpark — the same
 * magnitude as the `freeKicks` attribute that anchors the
 * set-piece formula's attacker / defender sums. The set-piece
 * formula multiplies this rating by 0.2 (the 'GK is a 20% factor'
 * design constant), so the GK's actual contribution to the
 * defender score at max skill is `20 × 0.2 = 4` — which lines
 * up with the 12 the attacker's free-kick sum contributes at
 * max skill, putting the design constant at a true 20%.
 */
export function gkSetPieceRating(attrs: Parameters<typeof gkRawRating>[0]): number {
    return gkRawRating(attrs) / GK_RATING_TOTAL_WEIGHT;
}

/**
 * Position-fit GK rating. Same coefficient vector, normalised
 * to 0-100 so the position-fit report can render 'perfect fit'
 * at 100% (i.e. an attribute set that hits the coefficient
 * vector exactly). The output here is unit-less: a player with
 * reflexes=20, handling=20, positioning=20, gk_aerial=20,
 * composure=20 scores 100; a player with all five at 0 scores
 * 0. The historical 5/3/2 formula capped at 100 with a
 * 'gk_reflexes+gk_handling+positioning' numerator; this version
 * weights all five attributes, with a total weight of 10.
 */
export function gkPositionFit(attrs: Parameters<typeof gkRawRating>[0]): number {
    return gkRawRating(attrs); // sum is already 0-200; consumer
    // divides by GK_RATING_TOTAL_WEIGHT if it wants a 0-100
    // percent. (The actual division happens in
    // `calculatePositionFit` — keeping the helper side-effects-
    // free lets the engine path opt out.)
}
