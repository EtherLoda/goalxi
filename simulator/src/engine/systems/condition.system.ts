export class ConditionSystem {
  // --- Status (Sigmoid) constants ---
  private static readonly S_MIN = 0.78;
  private static readonly S_RANGE = 0.34; // (1.12 - 0.78)
  private static readonly S_K = 1.5;
  private static readonly S_MID = 3.5;

  // --- Fitness (Exponential Decay) constants ---
  private static readonly F_R_FREE = 0.2;
  private static readonly F_LAMBDA = 1.0;

  // --- Experience (Exp) Base + Hyperbolic Saturation constants ---
  // expFactor = 1 + E_BASE_BONUS + (E_LIMIT_BONUS * exp) / (exp + E_GROWTH_K)
  //   exp=0  -> 1 + E_BASE_BONUS                 (rookie / 0 XP gets the base bonus)
  //   exp=INF -> 1 + E_BASE_BONUS + E_LIMIT_BONUS  (cap)
  // Half-saturation point: exp = E_GROWTH_K, factor = 1 + BASE + LIMIT/2.
  //
  // The 3% base bonus means a brand-new player (L0, 0 XP) already gets a
  // small but non-zero performance lift; the saturation curve then carries
  // the rest of the bonus smoothly through the playing career so L20+
  // veterans still feel the difference (rather than all hitting the ceiling
  // at L5). Total cap = 3% + 22% = 25%.
  private static readonly E_BASE_BONUS = 0.03;
  private static readonly E_LIMIT_BONUS = 0.22;
  private static readonly E_GROWTH_K = 100.0;

  // --- Penalty specific constant (cap = 50% = 2x the general cap) ---
  // Same shape as the general multiplier, with PENALTY_E_LIMIT = 2x
  // E_LIMIT_BONUS, so the cap stays at 50% (3% base + 47% limit). Keeping
  // the same base across both multiplier paths means a rookie's penalty
  // bonus equals their general bonus (3%), not 0% — consistent rookie feel.
  private static readonly PENALTY_E_LIMIT = 0.47;

  /**
   * Shared exp-factor formula. Pure: no `this` access, safe to inline.
   * Returns 1 + base + (limit * exp) / (exp + k).
   */
  private static expFactor(exp: number, base: number, limit: number, k: number): number {
    if (!Number.isFinite(exp)) return 1 + base;
    const clamped = Math.max(0, exp);
    return 1 + base + (limit * clamped) / (clamped + k);
  }

  /**
   * Calculates the overall performance multiplier for a player.
   * @param currentFit Current fitness [1, 6)
   * @param startFit Starting fitness (Stamina attribute) [1, 6)
   * @param status Form/Status [1, 6)
   * @param exp Experience [0, Infinity)
   */
  static calculateMultiplier(
    currentFit: number,
    startFit: number,
    status: number,
    exp: number,
  ): number {
    // 1. Experience Factor (Base + Hyperbolic Saturation)
    const expFactor = ConditionSystem.expFactor(
      exp, this.E_BASE_BONUS, this.E_LIMIT_BONUS, this.E_GROWTH_K,
    );

    // 2. Status/Form Factor (Sigmoid)
    let statusFactor: number;
    const sDiff = status - this.S_MID;
    if (sDiff === 0) {
      statusFactor = 0.95; // Midpoint approximation
    } else {
      statusFactor =
        this.S_MIN + this.S_RANGE / (1 + Math.exp(-this.S_K * sDiff));
    }

    // 3. Fitness Factor (Exponential Decay)
    let fitnessFactor = 1.0;
    const consumed = startFit - currentFit;
    const buffer = startFit * this.F_R_FREE;

    if (consumed > buffer) {
      const overdraftRatio = (consumed - buffer) / startFit;
      fitnessFactor = Math.exp(-this.F_LAMBDA * overdraftRatio);
    }

    // 4. Combined Result
    const result = fitnessFactor * statusFactor * expFactor;

    return Math.round(result * 1000) / 1000;
  }

  /**
   * Calculates fitness loss per minute.
   * We aim for a natural decay where a typical match consumes a significant portion of the "tank".
   */
  static calculateFitnessDecay(minutes: number): number {
    // Base rate: approx 2.25 units per 90m match (was 1.62).
    return minutes * 0.02;
  }

  /**
   * Recovery at half-time.
   */
  static calculateRecovery(stamina: number): number {
    // Recover 0.1 to 0.4 units based on stamina
    return 0.1 + (stamina / 6) * 0.3;
  }

  /**
   * Penalty specific multiplier: Ignores stamina, high experience bonus.
   */
  static calculatePenaltyMultiplier(status: number, exp: number): number {
    // 1. Status Factor (Sigmoid)
    let statusFactor: number;
    const sDiff = status - this.S_MID;
    if (sDiff === 0) {
      statusFactor = 0.95;
    } else {
      statusFactor =
        this.S_MIN + this.S_RANGE / (1 + Math.exp(-this.S_K * sDiff));
    }

    // 2. Experience Factor (Base + Hyperbolic, penalty-specific cap)
    const expFactor = ConditionSystem.expFactor(
      exp, this.E_BASE_BONUS, this.PENALTY_E_LIMIT, this.E_GROWTH_K,
    );

    return Math.round(statusFactor * expFactor * 1000) / 1000;
  }

  /**
   * Returns only the fitness factor (0–1) based on current vs start stamina.
   * Does NOT include form or experience.
   */
  static getFitnessFactor(currentFit: number, startFit: number): number {
    let fitnessFactor = 1.0;
    const consumed = startFit - currentFit;
    const buffer = startFit * this.F_R_FREE;

    if (consumed > buffer) {
      const overdraftRatio = (consumed - buffer) / startFit;
      fitnessFactor = Math.exp(-this.F_LAMBDA * overdraftRatio);
    }

    return Math.round(fitnessFactor * 1000) / 1000;
  }

  /**
   * Combined multiplier + fitness factor in a single call.
   *
   * `generateSnapshotEvent.mapPlayerStates` was previously calling
   * `getFitnessFactor` and `calculateMultiplier` back-to-back, which
   * recomputed the same `consumed / buffer / exp(-F_LAMBDA *
   * overdraftRatio)` block twice per player per snapshot (~22 × 18
   * = 400 calls per match). This variant computes the fitness
   * factor once, then folds it into the multiplier so both come
   * out of a single branch. Wire-format unchanged.
   */
  static getMultiplierWithFitnessFactor(
    currentFit: number,
    startFit: number,
    status: number,
    exp: number,
  ): { multiplier: number; fitnessFactor: number } {
    // 1. Experience Factor (Base + Hyperbolic Saturation) — same
    //    formula as `calculateMultiplier`.
    const expFactor = ConditionSystem.expFactor(
      exp, this.E_BASE_BONUS, this.E_LIMIT_BONUS, this.E_GROWTH_K,
    );

    // 2. Status/Form Factor (Sigmoid) — same formula as
    //    `calculateMultiplier`.
    const sDiff = status - this.S_MID;
    const statusFactor =
      sDiff === 0
        ? 0.95
        : this.S_MIN + this.S_RANGE / (1 + Math.exp(-this.S_K * sDiff));

    // 3. Fitness Factor (Exponential Decay) — once, shared
    //    between the returned `fitnessFactor` and the multiplier.
    let fitnessFactor = 1.0;
    const consumed = startFit - currentFit;
    const buffer = startFit * this.F_R_FREE;
    if (consumed > buffer) {
      const overdraftRatio = (consumed - buffer) / startFit;
      fitnessFactor = Math.exp(-this.F_LAMBDA * overdraftRatio);
    }

    const multiplier = Math.round(
      fitnessFactor * statusFactor * expFactor * 1000,
    ) / 1000;
    return {
      multiplier,
      fitnessFactor: Math.round(fitnessFactor * 1000) / 1000,
    };
  }
}
