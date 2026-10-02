import {
  calculatePotentialAbility,
  derivePotentialTier,
  PotentialTier,
  POTENTIAL_TIER_THRESHOLDS,
  DEFAULT_TIER_DISTRIBUTION,
  PA_MIN,
  PA_MAX,
} from "./potential";
import type { PlayerSkills } from "../entities/player.entity";

const perfectOutfield: PlayerSkills = {
  physical: { pace: 20, strength: 20 },
  technical: { finishing: 20, passing: 20, dribbling: 20, defending: 20 },
  mental: { positioning: 20, composure: 20 },
  setPieces: { freeKicks: 20, penalties: 20 },
};

const perfectGoalkeeper: PlayerSkills = {
  physical: { pace: 20, strength: 20 },
  // GKTechnical has THREE keys — `positioning` is deliberately absent;
  // a keeper reads positioning from `mental`.
  technical: { reflexes: 20, handling: 20, aerial: 20 },
  mental: { positioning: 20, composure: 20 },
  setPieces: { freeKlicks: 20, penalties: 20 },
} as unknown as PlayerSkills;

describe("calculatePotentialAbility", () => {
  it("rates a perfect outfielder at the ceiling", () => {
    expect(calculatePotentialAbility(perfectOutfield, false)).toBe(PA_MAX);
  });

  // THE REGRESSION. Both non-generator copies of this formula hard-coded
  // `maxRaw = 140`, which is the OUTFIELD ceiling. A keeper's is 120
  // (three technical skills, not four), so dividing by 140 capped every
  // goalkeeper at 120/140 = 85.7 — no keeper could ever be rated above
  // 86 potential, however good. `PlayerService` and
  // `team-onboarding-generator` both used that copy, so every keeper
  // created through either path was silently under-rated.
  it("does NOT cap a perfect goalkeeper at 86", () => {
    const pa = calculatePotentialAbility(perfectGoalkeeper, true);
    expect(pa).toBe(PA_MAX);
    expect(pa).toBeGreaterThan(86);
  });

  it("scales a goalkeeper against the goalkeeper ceiling, not the outfield one", () => {
    // Half-decent keeper should land near the midpoint, not ~43.
    const half: PlayerSkills = {
      ...perfectGoalkeeper,
      technical: { reflexes: 10, handling: 10, aerial: 10 },
    } as unknown as PlayerSkills;

    const pa = calculatePotentialAbility(half, true);
    expect(pa).toBeGreaterThan(45);
  });

  it("returns the floor for missing skills rather than throwing", () => {
    expect(calculatePotentialAbility(null, false)).toBe(PA_MIN);
    expect(calculatePotentialAbility(undefined, true)).toBe(PA_MIN);
  });

  it("clamps to the floor, not zero", () => {
    // The generator copy clamped to [5, 100]; the two mirrors clamped to
    // [0, 100]. A player with all-zero skills is a data artefact, not a
    // rating of 0.
    const zeroed: PlayerSkills = {
      physical: { pace: 0, strength: 0 },
      technical: { finishing: 0, passing: 0, dribbling: 0, defending: 0 },
      mental: { positioning: 0, composure: 0 },
      setPieces: { freeKicks: 0, penalties: 0 },
    };
    expect(calculatePotentialAbility(zeroed, false)).toBe(PA_MIN);
  });

  it("discounts mental and set pieces relative to physical/technical", () => {
    const physicalOnly: PlayerSkills = {
      physical: { pace: 20, strength: 20 },
      technical: { finishing: 0, passing: 0, dribbling: 0, defending: 0 },
      mental: { positioning: 0, composure: 0 },
      setPieces: { freeKicks: 0, penalties: 0 },
    };
    // 40 raw out of a 140 ceiling.
    expect(calculatePotentialAbility(physicalOnly, false)).toBe(
      Math.round((40 / 140) * 100),
    );
  });

  it("ignores non-numeric values inside a skill group", () => {
    const polluted = {
      ...perfectOutfield,
      technical: {
        ...perfectOutfield.technical,
        __meta: "ignore me" as unknown as number,
      },
    } as unknown as PlayerSkills;
    expect(calculatePotentialAbility(polluted, false)).toBe(PA_MAX);
  });
});

describe("derivePotentialTier", () => {
  it("maps each threshold to the band above it", () => {
    expect(derivePotentialTier(100)).toBe(PotentialTier.LEGEND);
    expect(derivePotentialTier(91)).toBe(PotentialTier.LEGEND);
    expect(derivePotentialTier(90)).toBe(PotentialTier.ELITE);
    expect(derivePotentialTier(81)).toBe(PotentialTier.ELITE);
    expect(derivePotentialTier(80)).toBe(PotentialTier.HIGH_PRO);
    expect(derivePotentialTier(71)).toBe(PotentialTier.HIGH_PRO);
    expect(derivePotentialTier(70)).toBe(PotentialTier.REGULAR);
    expect(derivePotentialTier(56)).toBe(PotentialTier.REGULAR);
    expect(derivePotentialTier(55)).toBe(PotentialTier.LOW);
  });

  it("floors anything below the lowest threshold", () => {
    expect(derivePotentialTier(0)).toBe(PotentialTier.LOW);
    expect(derivePotentialTier(-10)).toBe(PotentialTier.LOW);
  });

  /**
   * The five band names are a wire contract: `scouts.controller` returns
   * them to the UI and `web/src/app/[locale]/youth/squad/page.tsx`
   * hard-codes a `tierOrder` map keyed by exactly these strings. A rename
   * would silently sort every player to the bottom of the squad list
   * (`tierOrder[label] ?? 0`).
   */
  it("emits exactly the five labels the frontend sorts on", () => {
    const emitted = new Set<string>();
    for (let pa = 0; pa <= 100; pa++) emitted.add(derivePotentialTier(pa));

    expect([...emitted].sort()).toEqual([
      "ELITE",
      "HIGH_PRO",
      "LEGEND",
      "LOW",
      "REGULAR",
    ]);
  });

  it("has thresholds in descending order with no gaps or overlaps", () => {
    const values = POTENTIAL_TIER_THRESHOLDS.map(([t]) => t);
    expect(values).toEqual([...values].sort((a, b) => b - a));
    expect(new Set(values).size).toBe(values.length);
  });

  it("never emits the internal nine-step generation labels", () => {
    // Those come from `PlayerTier` in `api/src/utils/player-generator.ts`
    // and used to leak into this same API field.
    for (let pa = 0; pa <= 100; pa++) {
      const tier = derivePotentialTier(pa);
      expect(Object.values(PotentialTier)).toContain(tier);
    }
  });
});

describe("DEFAULT_TIER_DISTRIBUTION", () => {
  it("sums to 1", () => {
    const total = Object.values(DEFAULT_TIER_DISTRIBUTION).reduce(
      (a, b) => a + b,
      0,
    );
    expect(total).toBeCloseTo(1, 10);
  });

  it("covers every band exactly once", () => {
    expect(Object.keys(DEFAULT_TIER_DISTRIBUTION).sort()).toEqual(
      Object.values(PotentialTier).sort(),
    );
  });

  // This literal was copy-pasted into three call sites, which then drifted
  // in every OTHER field of the same object (different `algorithm`,
  // different PA range). Sharing it by reference is what stops that.
  it("is frozen so a caller cannot mutate the shared instance", () => {
    expect(Object.isFrozen(DEFAULT_TIER_DISTRIBUTION)).toBe(true);
  });
});
