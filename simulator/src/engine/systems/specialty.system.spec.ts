import { Player } from '../../types/player.types';
import {
  ActiveCoreSpecialty,
  SpecialtyEvent,
  TeamScopedPlayer,
  applyTierMultiplier,
  attackLaneMultiplier,
  commandDefenseMultiplier,
  defenseLaneMultiplier,
  foulRateMultiplier,
  getEventMultiplier,
  gkSaveMultiplier,
  injuryChanceMultiplier,
  midfieldControlMultiplier,
  pushDefenseMultiplier,
  pushOffenseMultiplier,
  selectAssistWeight,
  selectAttackTypeWeight,
  selectShooterCounterWeight,
  selectShooterCrossHeaderWeight,
  selectShooterReboundWeight,
  selectShooterWeight,
  selectShotTypeWeight,
  shotFkMultiplier,
  shotHeaderMultiplier,
  shotPenaltyMultiplier,
  teamProductEventMultiplier,
  teamSampledEventMultiplier,
} from './specialty.system';

// Minimal player fixture factory — the system only reads
// `attributes.coreSpecialty` and `attributes.coreSpecialtyTier`,
// so we stub the rest of the Player shape.
function playerWith(
  coreSpecialty: string | null,
  tier: 'GOLD' | 'SILVER' | 'BRONZE' = 'SILVER',
): Player {
  return {
    id: 1,
    name: 'Test',
    position: 'ST',
    attributes: {
      pace: 10,
      strength: 10,
      positioning: 10,
      composure: 10,
      freeKicks: 10,
      penalties: 10,
      finishing: 10,
      passing: 10,
      dribbling: 10,
      defending: 10,
      coreSpecialty,
      coreSpecialtyTier: tier,
    },
    currentStamina: 3,
    form: 5,
    experience: 5,
    exactAge: [20, 0],
    overall: 50,
    injuryPenalty: 1.0,
  } as unknown as Player;
}

// ────────────────────────────────────────────────────────────────────
// applyTierMultiplier — pure function, no Player state
// ────────────────────────────────────────────────────────────────────

describe('applyTierMultiplier', () => {
  it('Silver returns the base unchanged', () => {
    expect(applyTierMultiplier(1.10, 'SILVER')).toBeCloseTo(1.10, 5);
    expect(applyTierMultiplier(0.80, 'SILVER')).toBeCloseTo(0.80, 5);
  });

  it('Gold scales the base up (multiplicative exponent)', () => {
    // 1.10^1.4 ≈ 1.1427
    expect(applyTierMultiplier(1.10, 'GOLD')).toBeCloseTo(1.1427, 3);
    // 0.80^1.4 ≈ 0.7317 (more reduction for "lower is better" events)
    expect(applyTierMultiplier(0.80, 'GOLD')).toBeCloseTo(0.7317, 3);
  });

  it('Bronze scales the base down toward 1.0', () => {
    // 1.10^0.7 ≈ 1.0690 (mild boost still)
    expect(applyTierMultiplier(1.10, 'BRONZE')).toBeCloseTo(1.0690, 3);
    // 0.80^0.7 ≈ 0.8554 (less reduction for "lower is better" events)
    expect(applyTierMultiplier(0.80, 'BRONZE')).toBeCloseTo(0.8554, 3);
  });

  it('is monotone in tier for bases > 1.0', () => {
    const gold = applyTierMultiplier(1.10, 'GOLD');
    const silver = applyTierMultiplier(1.10, 'SILVER');
    const bronze = applyTierMultiplier(1.10, 'BRONZE');
    expect(gold).toBeGreaterThan(silver);
    expect(silver).toBeGreaterThan(bronze);
  });
});

// ────────────────────────────────────────────────────────────────────
// getEventMultiplier — no-specialty / deprecated / unknown paths
// ────────────────────────────────────────────────────────────────────

describe('getEventMultiplier — degenerate cases', () => {
  it('returns 1.0 when player has no specialty', () => {
    const p = playerWith(null);
    expect(getEventMultiplier(p, 'shot_header')).toBe(1.0);
    expect(getEventMultiplier(p, 'gk_save')).toBe(1.0);
    expect(getEventMultiplier(p, 'push_defense')).toBe(1.0);
  });

  it('returns 1.0 when player has a deprecated specialty (legacy data)', () => {
    const p = playerWith('LONG_SHOT'); // deprecated
    expect(getEventMultiplier(p, 'shot_header')).toBe(1.0);
    expect(getEventMultiplier(p, 'shot_long')).toBe(1.0);
  });

  it('returns 1.0 for an unknown code', () => {
    const p = playerWith('NOT_A_REAL_CODE');
    expect(getEventMultiplier(p, 'shot_header')).toBe(1.0);
  });

  it('returns 1.0 for (specialty, event) pairs that have no effect defined', () => {
    // POACHER has no shot_header effect — only select_shooter effects.
    const p = playerWith('POACHER');
    expect(getEventMultiplier(p, 'shot_header')).toBe(1.0);
  });
});

// ────────────────────────────────────────────────────────────────────
// Per-event × per-specialty smoke tests
// ────────────────────────────────────────────────────────────────────

describe('per-event × per-specialty multipliers (Silver tier)', () => {
  // The "right answer" for each (event, specialty) cell is encoded
  // directly. If the BASE_EFFECTS table changes, update this table
  // — keeping it as data avoids the test becoming a restatement of
  // the implementation.
  type Cell = { event: SpecialtyEvent; specialty: ActiveCoreSpecialty; expected: number };

  const cells: Cell[] = [
    // shot_header: AERIAL_THREAT only (v2.6). PHYSICAL_BEAST
    // moved to `shot_normal` to keep the "野兽" semantic aligned
    // with body contact in the box rather than aerial duels.
    { event: 'shot_header', specialty: 'AERIAL_THREAT', expected: 1.10 },
    { event: 'shot_header', specialty: 'PHYSICAL_BEAST', expected: 1.0 },
    { event: 'shot_header', specialty: 'POACHER', expected: 1.0 }, // not defined for shot_header

    // shot_normal: PHYSICAL_BEAST only (v2.6, moved from shot_header).
    // Wired in `calculateShootRating` — also fixes a long-standing
    // dead hook (`shotNormalMultiplier` was defined but never
    // consumed before this commit).
    { event: 'shot_normal', specialty: 'PHYSICAL_BEAST', expected: 1.10 },
    { event: 'shot_normal', specialty: 'AERIAL_THREAT', expected: 1.0 }, // not defined for shot_normal
    { event: 'shot_normal', specialty: 'POACHER', expected: 1.0 },

    // gk_save: SAVING_MASTER only
    { event: 'gk_save', specialty: 'SAVING_MASTER', expected: 1.10 },
    { event: 'gk_save', specialty: 'SWEEPER_KEEPER', expected: 1.0 },

    // attack_lane: SPEEDSTER and POACHER
    { event: 'attack_lane', specialty: 'SPEEDSTER', expected: 1.10 },
    { event: 'attack_lane', specialty: 'POACHER', expected: 1.10 },
    { event: 'attack_lane', specialty: 'WALL', expected: 1.0 },

    // defense_lane: WALL, SWEEPER_KEEPER
    { event: 'defense_lane', specialty: 'WALL', expected: 1.10 },
    { event: 'defense_lane', specialty: 'SWEEPER_KEEPER', expected: 1.05 },

    // push_offense
    { event: 'push_offense', specialty: 'DRIBBLER', expected: 1.15 },
    { event: 'push_offense', specialty: 'PLAYMAKER', expected: 1.10 },
    { event: 'push_offense', specialty: 'CROSSER', expected: 1.12 },

    // push_defense
    { event: 'push_defense', specialty: 'TACKLER', expected: 1.15 },
    { event: 'push_defense', specialty: 'WALL', expected: 1.18 },

    // midfield_control
    { event: 'midfield_control', specialty: 'TACKLER', expected: 1.20 },

    // select_shooter
    { event: 'select_shooter', specialty: 'POACHER', expected: 1.25 },
    { event: 'select_shooter_rebound', specialty: 'POACHER', expected: 1.25 },
    { event: 'select_shooter_counter', specialty: 'SPEEDSTER', expected: 1.20 },

    // select_assist
    { event: 'select_assist', specialty: 'PLAYMAKER', expected: 1.25 },
    { event: 'select_assist', specialty: 'CROSSER', expected: 1.20 },

    // select_attack_type / select_shot_type
    { event: 'select_attack_type', specialty: 'DRIBBLER', expected: 1.20 },
    { event: 'select_shot_type', specialty: 'CROSSER', expected: 1.20 },

    // foul_rate (values < 1.0)
    { event: 'foul_rate', specialty: 'TACKLER', expected: 0.80 },
    { event: 'foul_rate', specialty: 'DRIBBLER', expected: 0.90 },
    // COMPOSED halves the foul rate (per `docs/specialty-v2-design.md
    // §2.9 action point 4`). Wired in MatchEngine.resolveFoul.
    { event: 'foul_rate', specialty: 'COMPOSED', expected: 0.50 },

    // injury_chance
    { event: 'injury_chance', specialty: 'PHYSICAL_BEAST', expected: 0.90 },
    { event: 'injury_chance', specialty: 'AERIAL_THREAT', expected: 0.80 },

    // command_defense
    { event: 'command_defense', specialty: 'SWEEPER_KEEPER', expected: 1.05 },
  ];

  cells.forEach(({ event, specialty, expected }) => {
    it(`${specialty} × ${event} = ${expected} (Silver)`, () => {
      const p = playerWith(specialty, 'SILVER');
      expect(getEventMultiplier(p, event)).toBeCloseTo(expected, 5);
    });
  });
});

describe('Gold/Bronze tier scales correctly for a known pair', () => {
  it('AERIAL_THREAT + shot_header: Gold > Silver > Bronze', () => {
    const gold = playerWith('AERIAL_THREAT', 'GOLD');
    const silver = playerWith('AERIAL_THREAT', 'SILVER');
    const bronze = playerWith('AERIAL_THREAT', 'BRONZE');
    const g = getEventMultiplier(gold, 'shot_header');
    const s = getEventMultiplier(silver, 'shot_header');
    const b = getEventMultiplier(bronze, 'shot_header');
    expect(g).toBeGreaterThan(s);
    expect(s).toBeGreaterThan(b);
    // And the numbers are what the formula predicts
    expect(g).toBeCloseTo(Math.pow(1.10, 1.4), 5);
    expect(s).toBeCloseTo(1.10, 5);
    expect(b).toBeCloseTo(Math.pow(1.10, 0.7), 5);
  });

  it('TACKLER + foul_rate: Gold gives the biggest reduction', () => {
    // For "lower is better" events, Gold should produce the smallest
    // (most-reduced) multiplier.
    const gold = getEventMultiplier(playerWith('TACKLER', 'GOLD'), 'foul_rate');
    const silver = getEventMultiplier(playerWith('TACKLER', 'SILVER'), 'foul_rate');
    const bronze = getEventMultiplier(playerWith('TACKLER', 'BRONZE'), 'foul_rate');
    expect(gold).toBeLessThan(silver);
    expect(silver).toBeLessThan(bronze);
  });
});

// ────────────────────────────────────────────────────────────────────
// Named convenience getters — just verify they map to the right event
// ────────────────────────────────────────────────────────────────────

describe('named convenience getters', () => {
  it('attackLaneMultiplier / defenseLaneMultiplier map to attack_lane / defense_lane', () => {
    const p = playerWith('SPEEDSTER', 'GOLD');
    expect(attackLaneMultiplier(p)).toBe(getEventMultiplier(p, 'attack_lane'));
    const p2 = playerWith('WALL', 'GOLD');
    expect(defenseLaneMultiplier(p2)).toBe(getEventMultiplier(p2, 'defense_lane'));
  });

  it('shot* helpers map to the right events', () => {
    const p = playerWith('AERIAL_THREAT', 'SILVER');
    expect(shotHeaderMultiplier(p)).toBe(1.10);
  });

  it('gkSaveMultiplier applies to SAVING_MASTER', () => {
    const p = playerWith('SAVING_MASTER', 'SILVER');
    expect(gkSaveMultiplier(p)).toBe(1.10);
  });

  it('push* helpers map to push_offense / push_defense', () => {
    const dribbler = playerWith('DRIBBLER', 'SILVER');
    const wall = playerWith('WALL', 'SILVER');
    // v2.5: DRIBBLER is now attackType-gated. The "1.15 only on
    // DRIBBLE" semantic means the helper returns 1.0 when called
    // without an attackType arg (the safe default — see the
    // `pushOffenseMultiplier (v2.5 attackType-gated)` describe
    // block below for the full table). Pass `'DRIBBLE'` to
    // recover the v2.0 behavior.
    expect(pushOffenseMultiplier(dribbler, 'DRIBBLE')).toBe(1.15);
    expect(pushOffenseMultiplier(dribbler)).toBe(1.0);
    expect(pushDefenseMultiplier(wall)).toBe(1.18);
  });

  it('midfieldControlMultiplier applies to TACKLER', () => {
    const p = playerWith('TACKLER', 'SILVER');
    expect(midfieldControlMultiplier(p)).toBe(1.20);
  });

  it('select* helpers all return distinct values for distinct specialties', () => {
    const poacher = playerWith('POACHER', 'SILVER');
    const speedster = playerWith('SPEEDSTER', 'SILVER');
    expect(selectShooterWeight(poacher)).toBe(1.25);
    expect(selectShooterReboundWeight(poacher)).toBe(1.25);
    expect(selectShooterCounterWeight(speedster)).toBe(1.20);
  });

  it('select* weight helpers for PLAYMAKER / CROSSER', () => {
    expect(selectAssistWeight(playerWith('PLAYMAKER', 'SILVER'))).toBe(1.25);
    expect(selectAssistWeight(playerWith('CROSSER', 'SILVER'))).toBe(1.20);
    expect(selectAttackTypeWeight(playerWith('DRIBBLER', 'SILVER'))).toBe(1.20);
    expect(selectShotTypeWeight(playerWith('CROSSER', 'SILVER'))).toBe(1.20);
  });

  it('foulRateMultiplier / injuryChanceMultiplier / lateGameMentalMultiplier / commandDefenseMultiplier', () => {
    expect(foulRateMultiplier(playerWith('TACKLER', 'SILVER'))).toBe(0.80);
    expect(foulRateMultiplier(playerWith('DRIBBLER', 'SILVER'))).toBe(0.90);
    expect(foulRateMultiplier(playerWith('COMPOSED', 'SILVER'))).toBe(0.50);
    expect(injuryChanceMultiplier(playerWith('PHYSICAL_BEAST', 'SILVER'))).toBe(0.90);
    // AERIAL_THREAT injury reduction is jump-gated — without
    // actionType='jump' the helper returns 1.0 (no effect). Verifies
    // the gate lives in the helper and not the BASE_EFFECTS table.
    expect(injuryChanceMultiplier(playerWith('AERIAL_THREAT', 'SILVER'))).toBe(1.0);
    expect(injuryChanceMultiplier(playerWith('AERIAL_THREAT', 'SILVER'), 'jump')).toBe(0.80);
    expect(commandDefenseMultiplier(playerWith('SWEEPER_KEEPER', 'SILVER'))).toBe(1.05);
  });
});

// ────────────────────────────────────────────────────────────────────
// v2.5 set-piece + cross-shot hooks — the BASE_EFFECTS rows the
// design doc has promised since v2.0 but the engine never
// consumed until now.
// ────────────────────────────────────────────────────────────────────

describe('shotPenaltyMultiplier / shotFkMultiplier (v2.5 wired)', () => {
  it('shotPenaltyMultiplier: COMPOSED Silver = 1.15 (Gold 1.216, Bronze 1.103)', () => {
    // The numbers below are the v2 design doc §2.9 Hook 1 values
    // applied through the same `applyTierMultiplier(1.15, tier)`
    // formula used by every other hook. They're documented in the
    // test as much as in the helper because the BASE_EFFECTS row
    // was added in v2.5 to repair a "designed but never wired"
    // failure from the v2.0 spec.
    expect(shotPenaltyMultiplier(playerWith('COMPOSED', 'SILVER'))).toBe(1.15);
    // Tier scaling is `base ^ TIER_MULT[tier]`. 1.15^1.4 ≈ 1.2161.
    expect(shotPenaltyMultiplier(playerWith('COMPOSED', 'GOLD'))).toBeCloseTo(1.216, 3);
    // 1.15^0.7 ≈ 1.1027.
    expect(shotPenaltyMultiplier(playerWith('COMPOSED', 'BRONZE'))).toBeCloseTo(1.103, 3);
  });

  it('shotPenaltyMultiplier: 1.0 for non-COMPOSED players (any tier)', () => {
    // The helper should return 1.0 for every non-COMPOSED
    // specialty, including deprecated codes and no-spec — no
    // other specialty is in BASE_EFFECTS.shot_penalty. If a
    // future contributor adds another row (e.g. "POACHER shoot
    // rating on penalties" — which would be weird), the test
    // below would need to be updated.
    expect(shotPenaltyMultiplier(playerWith('AERIAL_THREAT', 'SILVER'))).toBe(1.0);
    expect(shotPenaltyMultiplier(playerWith(null, 'BRONZE'))).toBe(1.0);
  });

  it('shotFkMultiplier: COMPOSED Silver = 1.10 (Gold 1.143, Bronze 1.069)', () => {
    // v2 design doc §2.9 Hook 3 — "直接任意球 shoot rating +10%".
    // Numbers are applied through the same `applyTierMultiplier`
    // pipeline as the rest of the system.
    expect(shotFkMultiplier(playerWith('COMPOSED', 'SILVER'))).toBe(1.10);
    // 1.10^1.4 ≈ 1.1427.
    expect(shotFkMultiplier(playerWith('COMPOSED', 'GOLD'))).toBeCloseTo(1.143, 3);
    // 1.10^0.7 ≈ 1.0690.
    expect(shotFkMultiplier(playerWith('COMPOSED', 'BRONZE'))).toBeCloseTo(1.069, 3);
  });

  it('shotFkMultiplier: 1.0 for non-COMPOSED players', () => {
    expect(shotFkMultiplier(playerWith('DRIBBLER', 'SILVER'))).toBe(1.0);
    expect(shotFkMultiplier(playerWith(null, 'GOLD'))).toBe(1.0);
  });
});

describe('selectShooterCrossHeaderWeight (v2.5 wired)', () => {
  it('AERIAL_THREAT Silver = 1.20, Gold ≈ 1.291, Bronze ≈ 1.136', () => {
    // v2 design doc §2.1 Hook 2 — "传中 → AERIAL_THREAT 优先被
    // 选为 shooter". Silver base 1.20, applied through the
    // standard tier-scaling pipeline:
    //   Silver: 1.20^1.0 = 1.20
    //   Gold:   1.20^1.4 ≈ 1.2908
    //   Bronze: 1.20^0.7 ≈ 1.1361
    expect(selectShooterCrossHeaderWeight(playerWith('AERIAL_THREAT', 'SILVER'))).toBe(1.20);
    expect(selectShooterCrossHeaderWeight(playerWith('AERIAL_THREAT', 'GOLD'))).toBeCloseTo(1.291, 3);
    expect(selectShooterCrossHeaderWeight(playerWith('AERIAL_THREAT', 'BRONZE'))).toBeCloseTo(1.136, 3);
  });

  it('returns 1.0 for non-AERIAL_THREAT players', () => {
    // The hook is AERIAL_THREAT-only. POACHER (1.25) is on
    // `select_shooter` and `select_shooter_rebound`, not this
    // event — see BASE_EFFECTS. The tripwire guards against a
    // future contributor adding the wrong key.
    expect(selectShooterCrossHeaderWeight(playerWith('POACHER', 'SILVER'))).toBe(1.0);
    expect(selectShooterCrossHeaderWeight(playerWith('PHYSICAL_BEAST', 'GOLD'))).toBe(1.0);
    expect(selectShooterCrossHeaderWeight(playerWith(null, 'BRONZE'))).toBe(1.0);
  });
});

describe('pushOffenseMultiplier (v2.5 attackType-gated)', () => {
  it('PLAYMAKER (1.10) fires on all 4 pass types', () => {
    // v2.5: SHORT_PASS is now in scope (was the v2.0 miss that
    // left 80% of NORMAL shots without the PLAYMAKER buff).
    const passTypes: Array<'CROSS' | 'SHORT_PASS' | 'THROUGH_PASS' | 'DRIBBLE'> = [
      'CROSS',
      'SHORT_PASS',
      'THROUGH_PASS',
      'DRIBBLE',
    ];
    for (const at of passTypes) {
      expect(pushOffenseMultiplier(playerWith('PLAYMAKER', 'SILVER'), at)).toBe(1.10);
    }
  });

  it('DRIBBLER (1.15) fires only on DRIBBLE', () => {
    // DRIBBLER's "1v1 take-on" semantic only applies on a
    // DRIBBLE attackType. On CROSS / SHORT_PASS / THROUGH_PASS
    // the helper returns 1.0 (no buff).
    expect(pushOffenseMultiplier(playerWith('DRIBBLER', 'SILVER'), 'DRIBBLE')).toBe(1.15);
    expect(pushOffenseMultiplier(playerWith('DRIBBLER', 'SILVER'), 'CROSS')).toBe(1.0);
    expect(pushOffenseMultiplier(playerWith('DRIBBLER', 'SILVER'), 'SHORT_PASS')).toBe(1.0);
    expect(pushOffenseMultiplier(playerWith('DRIBBLER', 'SILVER'), 'THROUGH_PASS')).toBe(1.0);
  });

  it('CROSSER (1.12) fires only on CROSS', () => {
    // CROSSER's "wide delivery" semantic only applies on a
    // CROSS attackType. On other pass types the helper returns
    // 1.0.
    expect(pushOffenseMultiplier(playerWith('CROSSER', 'SILVER'), 'CROSS')).toBe(1.12);
    expect(pushOffenseMultiplier(playerWith('CROSSER', 'SILVER'), 'SHORT_PASS')).toBe(1.0);
    expect(pushOffenseMultiplier(playerWith('CROSSER', 'SILVER'), 'THROUGH_PASS')).toBe(1.0);
    expect(pushOffenseMultiplier(playerWith('CROSSER', 'SILVER'), 'DRIBBLE')).toBe(1.0);
  });

  it('PHYSICAL_BEAST (1.15) fires on any pushDuel attackType', () => {
    // "身体对抗" semantic applies regardless of pass type —
    // it's a body contact event, not a delivery-specific one.
    // Without the attackType arg, the helper still applies the
    // PHYSICAL_BEAST buff (gating only affects DRIBBLER / CROSSER).
    const anyType: Array<'CROSS' | 'SHORT_PASS' | 'THROUGH_PASS' | 'DRIBBLE' | 'LONG_SHOT'> = [
      'CROSS',
      'SHORT_PASS',
      'THROUGH_PASS',
      'DRIBBLE',
      'LONG_SHOT',
    ];
    for (const at of anyType) {
      expect(pushOffenseMultiplier(playerWith('PHYSICAL_BEAST', 'SILVER'), at)).toBe(1.15);
    }
    // And without an attackType arg, the PHYSICAL_BEAST buff
    // also fires (gating only affects DRIBBLER / CROSSER).
    expect(pushOffenseMultiplier(playerWith('PHYSICAL_BEAST', 'SILVER'))).toBe(1.15);
  });

  it('without attackType, DRIBBLER / CROSSER fall back to 1.0 (safe default)', () => {
    // The engine always passes attackType, but a future caller
    // that doesn't know it should get a 1.0 (no buff) for
    // DRIBBLER / CROSSER — those are the two entries where the
    // attackType matters. PLAYMAKER / PHYSICAL_BEAST still
    // apply because they don't gate on attackType.
    expect(pushOffenseMultiplier(playerWith('DRIBBLER', 'SILVER'))).toBe(1.0);
    expect(pushOffenseMultiplier(playerWith('CROSSER', 'SILVER'))).toBe(1.0);
    expect(pushOffenseMultiplier(playerWith('PLAYMAKER', 'SILVER'))).toBe(1.10);
    expect(pushOffenseMultiplier(playerWith('PHYSICAL_BEAST', 'SILVER'))).toBe(1.15);
  });

  it('composes multiplicatively for a hypothetical multi-specialty player', () => {
    // v2.4+ locks each player to a single core specialty, so
    // this scenario is impossible in production. The test
    // exists to pin the multiplicative composition rule —
    // a future "secondary specialty" feature (SPEC §8 #4)
    // would reuse this semantic.
    const noSpec = playerWith(null, 'SILVER');
    expect(pushOffenseMultiplier(noSpec, 'DRIBBLE')).toBe(1.0);
  });
});

// ────────────────────────────────────────────────────────────────────
// Team-level helpers (v2.4 split: decision vs strength class)
// ────────────────────────────────────────────────────────────────────

describe('teamSampledEventMultiplier (decision class)', () => {
  // Build a `players` array from a list of (code, tier) pairs.
  // All players default to `isSentOff = false` (eligible); the
  // sent-off cases are tested explicitly below.
  function lineup(
    ...specs: Array<[string | null, 'GOLD' | 'SILVER' | 'BRONZE']>
  ): TeamScopedPlayer[] {
    return specs.map(([code, tier]) => ({
      player: playerWith(code, tier),
    }));
  }

  it('returns 1.0 when no player has a relevant specialty', () => {
    const players = lineup(
      ['AERIAL_THREAT', 'SILVER'], // irrelevant for `midfield_control`
    );
    expect(teamSampledEventMultiplier(players, 'midfield_control')).toBe(1.0);
  });

  it('returns 1.0 for an empty lineup', () => {
    expect(teamSampledEventMultiplier([], 'midfield_control')).toBe(1.0);
  });

  it('single holder returns that holder\'s per-player multiplier (no depth bonus)', () => {
    // TACKLER Silver on midfield_control = 1.20. Single-holder
    // lineup is the degenerate case where the depth-bonus factor
    // is (1 + 0.025 × 0) = 1.0, so the helper returns the per-
    // player multiplier unchanged.
    const players = lineup(['TACKLER', 'SILVER']);
    expect(teamSampledEventMultiplier(players, 'midfield_control')).toBe(1.20);
  });

  it('single Gold holder returns max × 1.0 = 1.291 (no depth bonus on a single holder)', () => {
    // TACKLER's `midfield_control` base is 1.20 (Silver value).
    // `applyTierMultiplier(1.20, 'GOLD')` = 1.20^1.4 ≈ 1.291 — NOT
    // 1.40. The "Gold ≈ 1.40" number in the player-facing design doc
    // is a rounded back-of-envelope description, not the exact
    // tier-scaled value. This test pins the real number.
    const players = lineup(['TACKLER', 'GOLD']);
    expect(teamSampledEventMultiplier(players, 'midfield_control')).toBeCloseTo(1.2908, 3);
  });

  it('a sent-off holder is excluded from the eligible set', () => {
    // Only the sent-off player holds the specialty → eligible set is
    // empty → 1.0. Verifies `isSentOff` is honored, not just looked
    // up on the underlying `player` object.
    const players: TeamScopedPlayer[] = [
      {
        player: playerWith('TACKLER', 'SILVER'),
        isSentOff: true,
      },
    ];
    expect(teamSampledEventMultiplier(players, 'midfield_control')).toBe(1.0);
  });

  it('v2.5 depth bonus: 2 × Silver = 1.20 × 1.05 = 1.260', () => {
    // Two Silver TACKLERs. max = 1.20, N = 2, depth = 0.05 × 1
    // = 0.05. result = 1.20 × 1.05 = 1.260. This is the core
    // "广撒网有奖励" test — 2 × Silver (1.260) is strictly
    // better than 1 × Silver (1.20), so the lineup choice has
    // mechanical meaning.
    const players = lineup(
      ['TACKLER', 'SILVER'],
      ['TACKLER', 'SILVER'],
    );
    expect(teamSampledEventMultiplier(players, 'midfield_control')).toBeCloseTo(1.260, 5);
  });

  it('v2.5 depth bonus: 3 × Silver = 1.20 × 1.10 = 1.320 (no cap, known trade-off)', () => {
    // 3 Silver TACKLERs. depth = 0.05 × 2 = 0.10, max = 1.20,
    // result = 1.20 × 1.10 = 1.320. This is **above 1 × Gold
    // (1.291)** — a 3-deep Silver lineup strictly outperforms a
    // single Gold holder. The "no cap, depth > tier" state is
    // intentional (per user request 2026-08-24) and is the
    // price paid for the "广撒网真实有奖励" goal.
    const players = lineup(
      ['TACKLER', 'SILVER'],
      ['TACKLER', 'SILVER'],
      ['TACKLER', 'SILVER'],
    );
    expect(teamSampledEventMultiplier(players, 'midfield_control')).toBeCloseTo(1.320, 5);
  });

  it('v2.5 depth bonus: 5 × Silver = 1.20 × 1.20 = 1.440 (no cap, depth > Gold by 11.5%)', () => {
    // 5 Silver TACKLERs. depth = 0.05 × 4 = 0.20, max = 1.20,
    // result = 1.20 × 1.20 = 1.440. This is 11.5% above
    // 1 × Gold (1.291). The trade-off is explicitly accepted;
    // a future cap is the natural follow-up if balance drifts.
    const players = lineup(
      ['TACKLER', 'SILVER'],
      ['TACKLER', 'SILVER'],
      ['TACKLER', 'SILVER'],
      ['TACKLER', 'SILVER'],
      ['TACKLER', 'SILVER'],
    );
    expect(teamSampledEventMultiplier(players, 'midfield_control')).toBeCloseTo(1.440, 5);
  });

  it('mixed tier: 1 Gold + 1 Silver = 1.291 × 1.05 = 1.355 (depth wins over tier max)', () => {
    // The depth bonus applies on top of the best single holder's
    // per-player multiplier, regardless of tier mix. With 2
    // eligible holders the depth factor is 1.05, so the result
    // is `max(Gold=1.291, Silver=1.20) × 1.05` = 1.355. This
    // is 5% better than 1 × Gold alone — a 2-holder lineup is
    // a real upgrade.
    const players = lineup(
      ['TACKLER', 'GOLD'],
      ['TACKLER', 'SILVER'],
    );
    expect(teamSampledEventMultiplier(players, 'midfield_control')).toBeCloseTo(1.355, 3);
  });

  it('mixed tier: 1 Gold + 1 Bronze = 1.291 × 1.05 = 1.355 (Bronze contributes to depth, not to max)', () => {
    // The Bronze holder is included in the eligible-count (its
    // multiplier is 0.86×^0.7 ≈ 1.136, not 1.0), so it counts
    // toward the depth-bonus factor even though `max` is still
    // the Gold holder's 1.291. This is the property that lets a
    // "weak holder" still contribute to a depth strategy — a
    // future contributor might be tempted to skip the Bronze
    // holder; the test pins that we don't.
    const players = lineup(
      ['TACKLER', 'GOLD'],
      ['TACKLER', 'BRONZE'],
    );
    expect(teamSampledEventMultiplier(players, 'midfield_control')).toBeCloseTo(1.355, 3);
  });

  it('is deterministic for a given (players, event) pair', () => {
    // v2.5 formula is pure-deterministic — no random draw. The
    // previous v2.4 weighted-pick returned different values for
    // the same input across calls (depending on the random
    // draw), which made `convex-regression` engine tests
    // occasionally flake. v2.5 fixes that.
    const players = lineup(
      ['TACKLER', 'GOLD'],
      ['TACKLER', 'SILVER'],
    );
    const r1 = teamSampledEventMultiplier(players, 'midfield_control');
    const r2 = teamSampledEventMultiplier(players, 'midfield_control');
    expect(r1).toBe(r2);
  });
});

describe('teamProductEventMultiplier (strength class)', () => {
  function lineup(
    ...specs: Array<[string | null, 'GOLD' | 'SILVER' | 'BRONZE']>
  ): TeamScopedPlayer[] {
    return specs.map(([code, tier]) => ({
      player: playerWith(code, tier),
    }));
  }

  it('returns 1.0 when no player has a relevant specialty', () => {
    const players = lineup(['AERIAL_THREAT', 'SILVER']);
    expect(teamProductEventMultiplier(players, 'push_defense')).toBe(1.0);
  });

  it('returns 1.0 for an empty lineup', () => {
    expect(teamProductEventMultiplier([], 'push_defense')).toBe(1.0);
  });

  it('single Silver holder returns 1.15 (TACKLER push_defense Silver base)', () => {
    // TACKLER's `push_defense` Silver base is 1.15 (NOT 1.20 —
    // `midfield_control` is 1.20). The two hooks have different
    // per-event bases.
    const players = lineup(['TACKLER', 'SILVER']);
    expect(teamProductEventMultiplier(players, 'push_defense', 1.80)).toBe(1.15);
  });

  it('two Silver holders: product = 1.15 × 1.15 = 1.3225', () => {
    const players = lineup(
      ['TACKLER', 'SILVER'],
      ['TACKLER', 'SILVER'],
    );
    expect(teamProductEventMultiplier(players, 'push_defense', 1.80)).toBeCloseTo(1.3225, 4);
  });

  it('three Silver holders: product = 1.15³ ≈ 1.5209 (under the 1.80 cap)', () => {
    const players = lineup(
      ['TACKLER', 'SILVER'],
      ['TACKLER', 'SILVER'],
      ['TACKLER', 'SILVER'],
    );
    expect(teamProductEventMultiplier(players, 'push_defense', 1.80)).toBeCloseTo(1.5209, 4);
  });

  it('five Silver holders: cap engaged at 1.80', () => {
    // 1.15^5 ≈ 2.011, above the default cap of 1.80. The helper
    // must return exactly 1.80, not the raw product. This is the
    // property that prevents deep TACKLER lineups from blowing up
    // the defending side.
    const players = lineup(
      ['TACKLER', 'SILVER'],
      ['TACKLER', 'SILVER'],
      ['TACKLER', 'SILVER'],
      ['TACKLER', 'SILVER'],
      ['TACKLER', 'SILVER'],
    );
    expect(teamProductEventMultiplier(players, 'push_defense', 1.80)).toBe(1.80);
  });

  it('mixed WALL Silver + TACKLER Silver: both contribute to the product', () => {
    // WALL Silver 1.18 × TACKLER Silver 1.15 = 1.357. The two
    // entries are independent rows in BASE_EFFECTS.push_defense,
    // so both holders add their own multiplier.
    const players = lineup(
      ['WALL', 'SILVER'],
      ['TACKLER', 'SILVER'],
    );
    expect(teamProductEventMultiplier(players, 'push_defense', 1.80)).toBeCloseTo(1.18 * 1.15, 5);
  });

  it('a sent-off holder is excluded from the product', () => {
    const players: TeamScopedPlayer[] = [
      {
        player: playerWith('TACKLER', 'SILVER'),
        isSentOff: true,
      },
      {
        player: playerWith('TACKLER', 'SILVER'),
      },
    ];
    // Only the non-sent-off holder counts; the sent-off one is skipped.
    expect(teamProductEventMultiplier(players, 'push_defense', 1.80)).toBe(1.15);
  });

  it('cap of 1.0 disables the cap (returns the raw product)', () => {
    // A cap of 1.0 is treated as "no cap" because the helper only
    // applies the cap when `cap > 1.0`. This lets callers pass
    // 1.0 to opt out of capping if they want the raw product.
    const players = lineup(
      ['TACKLER', 'SILVER'],
      ['TACKLER', 'SILVER'],
    );
    expect(teamProductEventMultiplier(players, 'push_defense', 1.0)).toBeCloseTo(1.3225, 4);
  });
});

// ────────────────────────────────────────────────────────────────────
// Source-level tripwire — every SpecialtyEvent that has a row in
// `BASE_EFFECTS` must be consumed somewhere in the simulator. This
// guards the v1 → v2 dead-helper failure mode where the spec table
// was refactored, the `BASE_EFFECTS` row was added, but the engine
// never actually started calling the helper. We detect that at test
// time so a future contributor can't reintroduce a "designed but
// never wired" specialty event.
//
// Implementation: load `BASE_EFFECTS` and `SpecialtyEvent` as text
// from the source files (rather than importing the internal table,
// which is intentionally not exported), then for each event with a
// non-empty row, scan every `.ts` file under `simulator/src/engine/`
// (skipping this spec file and `specialty.system.ts` itself, which
// are the only places that legitimately reference every event as a
// string). If a hook row is defined but no engine call site uses the
// event, the test fails with a clear "dead hook" message.
//
// Forward-compat escape hatch: events with no BASE_EFFECTS row at
// all are not checked — the table is the source of truth, not the
// type union. The previous `late_game_mental` placeholder lived
// here as a v2.5+ cleanup-era artefact; it's been removed (see
// commit log), so the escape-hatch list is now empty.
// ────────────────────────────────────────────────────────────────────

import * as fs from 'fs';
import * as path from 'path';

describe('specialty hook wire-up tripwire (source-level)', () => {
  const repoRoot = path.resolve(__dirname, '../../../..');
  const specialtySystemPath = path.join(
    repoRoot,
    'simulator/src/engine/systems/specialty.system.ts',
  );
  const specPath = __filename;

  function readSource(file: string): string {
    return fs.readFileSync(file, 'utf8');
  }

  // Recursive .ts scan under `simulator/src/engine/`. Returns a map
  // from absolute path → file contents. Excludes this spec file and
  // the system file under test (which legitimately lists every event
  // as a string in the `BASE_EFFECTS` table and the named helpers).
  function collectEngineSources(): Map<string, string> {
    const root = path.join(repoRoot, 'simulator/src/engine');
    const out = new Map<string, string>();
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(full);
        } else if (entry.isFile() && full.endsWith('.ts')) {
          if (full === specPath) continue;
          if (full === specialtySystemPath) continue;
          out.set(full, readSource(full));
        }
      }
    };
    walk(root);
    return out;
  }

  // Extract every event name that has a non-empty `BASE_EFFECTS` row.
  // We parse the table from source rather than importing it because
  // `BASE_EFFECTS` is intentionally not exported (it's a private
  // implementation detail of `getEventMultiplier`).
  function extractEventsWithHooks(systemSrc: string): string[] {
    const re = /^\s*([a-z_]+):\s*\{[\s\S]*?\b[A-Z_]+:\s*[0-9.]+/gm;
    const out: string[] = [];
    let m: RegExpExecArray | null;
    while ((m = re.exec(systemSrc)) !== null) {
      out.push(m[1]);
    }
    return out;
  }

  // Map every event key to the named helper that consumes it.
  // Engine call sites use the named helper (e.g. `attackLaneMultiplier`),
  // and the helper internally calls `getEventMultiplier(player, 'attack_lane')`
  // — the string literal only lives inside `specialty.system.ts` itself.
  // Without this map, the tripwire would false-positive every event
  // that goes through a named helper (which is most of them).
  //
  // Convention: snake_case event → camelCase + (Multiplier | Weight).
  // `select_*` events use the `Weight` suffix; everything else uses
  // `Multiplier`. Keep this in sync with `specialty.system.ts`.
  const eventToHelper: Record<string, string> = {
    attack_lane: 'attackLaneMultiplier',
    defense_lane: 'defenseLaneMultiplier',
    shot_header: 'shotHeaderMultiplier',
    shot_long: 'shotLongMultiplier',
    shot_rebound: 'shotReboundMultiplier',
    shot_one_on_one: 'shotOneOnOneMultiplier',
    shot_normal: 'shotNormalMultiplier',
    shot_penalty: 'shotPenaltyMultiplier',
    shot_fk: 'shotFkMultiplier',
    gk_save: 'gkSaveMultiplier',
    push_offense: 'pushOffenseMultiplier',
    push_defense: 'pushDefenseMultiplier',
    midfield_control: 'midfieldControlMultiplier',
    select_shooter: 'selectShooterWeight',
    select_shooter_rebound: 'selectShooterReboundWeight',
    select_shooter_counter: 'selectShooterCounterWeight',
    select_shooter_cross_header: 'selectShooterCrossHeaderWeight',
    select_assist: 'selectAssistWeight',
    select_attack_type: 'selectAttackTypeWeight',
    select_shot_type: 'selectShotTypeWeight',
    foul_rate: 'foulRateMultiplier',
    injury_chance: 'injuryChanceMultiplier',
    command_defense: 'commandDefenseMultiplier',
  };

  const systemSrc = readSource(specialtySystemPath);
  const eventsWithHooks = extractEventsWithHooks(systemSrc);
  const engineSources = collectEngineSources();

  // Events that the spec explicitly reserves as a placeholder until
  // a real engine consumer exists. The BASE_EFFECTS row stays as a
  // no-op (1.0) so future contributors can populate it without
  // touching the engine call site map. See
  // `docs/specialty-v2-design.md` §2.9 for the COMPOSED late-game
  // hook, which is the only entry in this list today. The tripwire
  // skips these so the design doc's "leave it in the table" intent
  // is preserved; updating this list requires a SPEC doc change in
  // the same commit.
  const RESERVED_PLACEHOLDERS = new Set<string>();
  const liveEvents = eventsWithHooks.filter(
    (e) => !RESERVED_PLACEHOLDERS.has(e),
  );

  it('BASE_EFFECTS exposes at least the design-doc events', () => {
    // Defensive — if the parser above breaks, this fails loudly
    // instead of silently allowing the next test to pass.
    expect(eventsWithHooks.length).toBeGreaterThan(10);
  });

  it('event→helper map covers every BASE_EFFECTS row', () => {
    // If a new event is added to BASE_EFFECTS without updating the
    // map, the tripwire falls back to string-literal-only search and
    // would false-positive. This test forces the contributor to
    // update the map alongside the table.
    const missing = liveEvents.filter((event) => !(event in eventToHelper));
    expect(missing).toEqual([]);
  });

  it.each(liveEvents)(
    'specialty event "%s" is consumed by at least one engine file',
    (event) => {
      // A hook is "consumed" if EITHER:
      //   (a) the literal `'event_name'` appears in an engine file
      //       (caller is using `getEventMultiplier` directly, or one
      //       of the team-level helpers — `teamSampledEventMultiplier`
      //       / `teamProductEventMultiplier` — with the event as a
      //       string), OR
      //   (b) the named helper for this event is called from an
      //       engine file.
      // Both are equivalent ways of consuming the hook — most callers
      // use the named helper. The string-literal fallback handles
      // the team-level helper paths used by `Team.updateSnapshot` and
      // `match.engine.ts` for several hooks.
      const stringHits: string[] = [];
      const helperName = eventToHelper[event];
      const helperNeedle = helperName ? `${helperName}(` : null;
      const helperHits: string[] = [];
      for (const [file, src] of engineSources) {
        const rel = path.relative(repoRoot, file);
        if (src.includes(`'${event}'`)) {
          stringHits.push(rel);
        }
        if (helperNeedle && src.includes(helperNeedle)) {
          helperHits.push(rel);
        }
      }
      const matchingFiles = Array.from(
        new Set([...stringHits, ...helperHits]),
      );
      expect({
        event,
        helper: helperName,
        stringLiteralHits: stringHits,
        helperCallHits: helperHits,
        matchingFiles,
        searchedFiles: engineSources.size,
        message: `specialty event '${event}' has a BASE_EFFECTS row but no engine file consumes it (no '${event}' literal and no ${helperName ?? '(no named helper)'}() call) — likely a dead hook`,
      }).toEqual(
        expect.objectContaining({
          matchingFiles: expect.arrayContaining([expect.any(String)]),
        }),
      );
    },
  );
});
