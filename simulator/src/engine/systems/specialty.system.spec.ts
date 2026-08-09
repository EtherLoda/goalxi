import { Player } from '../../types/player.types';
import {
  ActiveCoreSpecialty,
  SpecialtyEvent,
  applyTierMultiplier,
  attackLaneMultiplier,
  commandDefenseMultiplier,
  defenseLaneMultiplier,
  foulRateMultiplier,
  getEventMultiplier,
  gkSaveMultiplier,
  injuryChanceMultiplier,
  lateGameMentalMultiplier,
  midfieldControlMultiplier,
  pushDefenseMultiplier,
  pushOffenseMultiplier,
  selectAssistWeight,
  selectAttackTypeWeight,
  selectShooterCounterWeight,
  selectShooterReboundWeight,
  selectShooterWeight,
  selectShotTypeWeight,
  shotHeaderMultiplier,
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
    // shot_header: AERIAL_THREAT and PHYSICAL_BEAST both at 1.10
    { event: 'shot_header', specialty: 'AERIAL_THREAT', expected: 1.10 },
    { event: 'shot_header', specialty: 'PHYSICAL_BEAST', expected: 1.10 },
    { event: 'shot_header', specialty: 'POACHER', expected: 1.0 }, // not defined for shot_header

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

    // injury_chance
    { event: 'injury_chance', specialty: 'PHYSICAL_BEAST', expected: 0.90 },
    { event: 'injury_chance', specialty: 'AERIAL_THREAT', expected: 0.80 },

    // late_game_mental
    { event: 'late_game_mental', specialty: 'COMPOSED', expected: 0.80 },

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
    expect(pushOffenseMultiplier(dribbler)).toBe(1.15);
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
    expect(injuryChanceMultiplier(playerWith('PHYSICAL_BEAST', 'SILVER'))).toBe(0.90);
    expect(lateGameMentalMultiplier(playerWith('COMPOSED', 'SILVER'))).toBe(0.80);
    expect(commandDefenseMultiplier(playerWith('SWEEPER_KEEPER', 'SILVER'))).toBe(1.05);
  });
});
