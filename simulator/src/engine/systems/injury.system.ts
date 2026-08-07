import { estimateRecoveryDays } from '@goalxi/database';

export type InjuryType = 'muscle' | 'ligament' | 'joint' | 'head' | 'other';
/**
 * Two-tier severity as of the 2026-08-06 collapse:
 *   - `mild`: player can keep playing (knock, shakes it off). injuryValue
 *             falls in the low range (20-55 depending on type).
 *   - `severe`: player must leave the pitch (tissue damage, ligament
 *               tear, head knock, etc.). The engine tries a same-position
 *               sub first; if no bench player is available the injured
 *               player is sent off (10 men for the rest of the match).
 *
 * The old three-tier model (mild/moderate/severe) was collapsed into
 * two because `moderate` and `severe` shared the same gameplay outcome
 * ("force the player off") and only differed in the recovery length —
 * the recovery length is now driven by the `injuryValue` directly, so
 * the extra severity tier added UI/DTO complexity without changing the
 * simulation. The old `severity=3` rows in the DB are mapped to
 * `severity=2` in migration 1729000000000-MergeInjurySeverity.
 */
export type InjurySeverity = 'mild' | 'severe';

export interface InjuryResult {
  willInjure: boolean;
  injuryType: InjuryType | null;
  severity: InjurySeverity | null;
  injuryValue: number | null;
  /** Estimated days to fully recover (single value, deterministic). */
  estimatedDays: number | null;
}

export interface InjuryEventData {
  playerId: number;
  injuryType: InjuryType;
  severity: InjurySeverity;
  injuryValue: number;
  /** Estimated days to fully recover (single value). */
  estimatedRecoveryDays: number;
}

export class InjurySystem {
  // Base injury probability per match (0.5%) — currently unused
  // (the per-action table in `generateInjury` overrides it). Kept
  // for backwards compatibility with older call sites.
  private static readonly BASE_INJURY_CHANCE = 0.005;

  // Injury value ranges by type and severity. `severe` here carries the
  // value range previously used by `moderate` (50-110 depending on type)
  // — the old `severe` tier (100-190) was a 70-90 day layoff that
  // dwarfed every other gameplay element; merging it into the new
  // `severe` keeps the recovery curve within a 1-3 week window, which
  // is closer to real-world training-pace return-to-play windows.
  //
  // Mild vs severe invariant (P1-#2 alignment, calibrated
  // 2026-08-06): every `mild` value must be ≤
  // `GAME_SETTINGS.INJURY_MINOR_VALUE_THRESHOLD` (30). The player-side
  // `injuryState` is derived from the value at write time
  // (`value <= 30 → 'minor'`, can play at 95%; `value > 30 → 'severe'`,
  // must leave the pitch). The simulator's `mild` outcome means "player
  // can keep playing" — so its value range must sit inside the minor
  // band, otherwise the engine's "can play" intent and the DB's
  // "must sit out" state contradict each other. Severe ranges start
  // at 50 to leave a clear gap from the mild ceiling.
  private static readonly INJURY_VALUES: Record<
    InjuryType,
    Record<InjurySeverity, [number, number]>
  > = {
    muscle: { mild: [15, 30], severe: [50, 80] },
    ligament: { mild: [15, 30], severe: [60, 100] },
    joint: { mild: [15, 30], severe: [55, 90] },
    head: { mild: [15, 30], severe: [70, 110] },
    other: { mild: [15, 30], severe: [50, 80] },
  };

  // (Removed: `TREATMENT_TIME` table and `getTreatmentTime()`
  // method — the engine used to write a `treatmentTime` field on
  // every `InjuryEventData` to indicate how many seconds of on-pitch
  // treatment the injury would consume. Nothing in the codebase
  // ever read that field, and no path consumed match time on a
  // treatment event. 2026-08-06: deleted. If a future feature
  // wants "delayed re-entry after treatment", re-introduce the
  // constant alongside the consumer that needs it.)

  /** Severity roll cutoff. 20% mild, 80% severe. */
  private static readonly SEVERITY_MILD_THRESHOLD = 0.2;

  /**
   * Calculate if a player will get injured based on various factors.
   *
   * @param baseChance - Base probability (already calculated from action type)
   * @param playerAge - Player's age (not used for injury chance anymore, kept for signature)
   * @param playerStamina - Player's stamina level [1-6]
   * @param isHomeMatch - Whether the match is at home
   * @param doctorLevel - Team doctor level (0 = no doctor)
   * @param injuryState - Player's current injury state ('minor' increases risk)
   */
  static calculateInjuryChance(
    baseChance: number,
    playerAge: number,
    playerStamina: number,
    isHomeMatch: boolean = true,
    doctorLevel: number = 0,
    injuryState?: 'minor' | 'severe' | null,
  ): number {
    let chance = baseChance;

    // Stamina multiplier (low stamina = higher injury risk)
    const staminaMultiplier =
      playerStamina <= 2
        ? 1.5
        : playerStamina <= 3
          ? 1.2
          : playerStamina <= 4
            ? 1.0
            : 0.8;
    chance *= staminaMultiplier;

    // Minor injury increases injury probability (already injured body is more vulnerable)
    if (injuryState === 'minor') {
      chance *= 2.0;
    }

    // Home advantage slightly reduces injury risk
    if (isHomeMatch) {
      chance *= 0.9;
    }

    // Team doctor reduces injury chance by 10% per level
    if (doctorLevel > 0) {
      chance *= 1 - 0.1 * doctorLevel;
    }

    return chance;
  }

  /**
   * Determine injury type based on the action that caused it.
   */
  static determineInjuryType(
    actionType: 'tackle' | 'sprint' | 'jump' | 'collision' | 'other',
  ): InjuryType {
    // Tightened from `Record<string, InjuryType>` so TypeScript
    // catches a missing `actionType` case at compile time (e.g.
    // if a new action is added to the union, the map forces a
    // fall-through decision). A typo in a key would also error.
    const typeMap: Record<
      'tackle' | 'sprint' | 'jump' | 'collision' | 'other',
      InjuryType
    > = {
      tackle: 'muscle',
      sprint: 'muscle',
      jump: 'joint',
      collision: 'head',
      other: 'other',
    };
    return typeMap[actionType];
  }

  /**
   * Determine injury severity based on random chance.
   *
   * Distribution (calibrated 2026-08-06, post-collapse):
   *   - mild (20%): player can continue playing (knock, shakes it off)
   *   - severe (80%): tissue damage / serious injury, player must
   *     leave the pitch. The engine attempts a substitution; if no
   *     bench player is available, the injured player is sent off
   *     (team plays with 10 men for the rest of the match).
   */
  static determineSeverity(): InjurySeverity {
    const roll = Math.random();
    if (roll < this.SEVERITY_MILD_THRESHOLD) return 'mild';
    return 'severe';
  }

  /**
   * Generate injury result for an action that could cause injury.
   *
   * @param onInjury Optional callback fired when an injury is triggered,
   *   receiving the result plus the inputs that produced it. Used by the
   *   match engine to log injury events without coupling InjurySystem to a
   *   specific logger.
   */
  static generateInjury(
    actionType: 'tackle' | 'sprint' | 'jump' | 'collision' | 'other',
    playerAge: number,
    playerStamina: number,
    isHomeMatch: boolean = true,
    doctorLevel: number = 0,
    injuryState?: 'minor' | 'severe' | null,
    onInjury?: (
      result: InjuryResult,
      ctx: {
        actionType: 'tackle' | 'sprint' | 'jump' | 'collision' | 'other';
        playerAge: number;
        doctorLevel: number;
      },
    ) => void,
  ): InjuryResult {
    // Base chance varies by action type
    const actionChance: Record<string, number> = {
      tackle: 0.02, // 2% chance on tackle
      sprint: 0.015, // 1.5% chance on sprint
      jump: 0.01, // 1% chance on jump
      collision: 0.03, // 3% chance on collision
      other: 0.005, // 0.5% chance on other actions
    };

    const chance = this.calculateInjuryChance(
      actionChance[actionType],
      playerAge,
      playerStamina,
      isHomeMatch,
      doctorLevel,
      injuryState,
    );

    if (Math.random() > chance) {
      return {
        willInjure: false,
        injuryType: null,
        severity: null,
        injuryValue: null,
        estimatedDays: null,
      };
    }

    const injuryType = this.determineInjuryType(actionType);
    const severity = this.determineSeverity();
    const [minValue, maxValue] = this.INJURY_VALUES[injuryType][severity];
    const injuryValue =
      Math.floor(Math.random() * (maxValue - minValue + 1)) + minValue;

    // Deterministic recovery estimate based on shared formula.
    const estimatedDays = estimateRecoveryDays(
      injuryValue,
      playerAge,
      doctorLevel,
    );

    const result: InjuryResult = {
      willInjure: true,
      injuryType,
      severity,
      injuryValue,
      estimatedDays,
    };

    if (onInjury) {
      onInjury(result, { actionType, playerAge, doctorLevel });
    }

    return result;
  }

  /**
   * Estimate recovery days for a given injury value and player profile.
   * Thin re-export of the shared deterministic formula for backwards
   * compatibility with engine call sites that don't have the util at hand.
   *
   * @param injuryValue - Current injury value
   * @param playerAge - Player age (years, fractional ok)
   * @param doctorLevel - Team doctor level (0 = no doctor)
   * @returns Estimated days to full recovery, minimum 1
   */
  static estimateRecoveryDays(
    injuryValue: number,
    playerAge: number,
    doctorLevel: number = 0,
  ): number {
    return estimateRecoveryDays(injuryValue, playerAge, doctorLevel);
  }
}
