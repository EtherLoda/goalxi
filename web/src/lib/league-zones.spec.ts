import {
  resolveZoneModel,
  zoneForPosition,
  zonesPresent,
  type LeagueZoneModel,
} from "./league-zones";

const tier2of4: LeagueZoneModel = {
  tier: 2,
  tierCount: 4,
  maxTeams: 16,
  promotionSlots: 1,
  playoffSlots: 4,
  relegationSlots: 4,
};

describe("zoneForPosition", () => {
  it("marks only the champion as a direct promotion", () => {
    expect(zoneForPosition(1, tier2of4, 16)).toBe("promote");
    expect(zoneForPosition(2, tier2of4, 16)).toBe("promotePlayoff");
  });

  it("marks 9th-12th as the relegation playoff and 13th+ as relegated", () => {
    expect(zoneForPosition(8, tier2of4, 16)).toBeNull();
    expect(zoneForPosition(9, tier2of4, 16)).toBe("relPlayoff");
    expect(zoneForPosition(12, tier2of4, 16)).toBe("relPlayoff");
    expect(zoneForPosition(13, tier2of4, 16)).toBe("rel");
    expect(zoneForPosition(16, tier2of4, 16)).toBe("rel");
  });

  it("leaves 3rd-8th unmarked", () => {
    for (const position of [3, 4, 5, 6, 7, 8]) {
      expect(zoneForPosition(position, tier2of4, 16)).toBeNull();
    }
  });

  it("has no promotion in the top flight, because there is nobody above", () => {
    const topFlight: LeagueZoneModel = { ...tier2of4, tier: 1 };

    expect(zoneForPosition(1, topFlight, 16)).toBeNull();
    expect(zoneForPosition(2, topFlight, 16)).toBeNull();
    // Relegation from the top flight is real.
    expect(zoneForPosition(13, topFlight, 16)).toBe("rel");
  });

  it("has no relegation in the bottom tier, because there is nowhere to fall", () => {
    const bottom: LeagueZoneModel = { ...tier2of4, tier: 4 };

    expect(zoneForPosition(1, bottom, 16)).toBe("promote");
    expect(zoneForPosition(13, bottom, 16)).toBeNull();
    expect(zoneForPosition(16, bottom, 16)).toBeNull();
  });

  it("follows the league's own slot counts instead of the 16/4/4 default", () => {
    const small: LeagueZoneModel = {
      tier: 2,
      tierCount: 3,
      maxTeams: 12,
      promotionSlots: 2,
      playoffSlots: 2,
      relegationSlots: 3,
    };

    expect(zoneForPosition(1, small, 12)).toBe("promote");
    expect(zoneForPosition(2, small, 12)).toBe("promote");
    // relegationStart = 12 - 3 + 1 = 10, playoffStart = 10 - 2 = 8
    expect(zoneForPosition(7, small, 12)).toBeNull();
    expect(zoneForPosition(8, small, 12)).toBe("relPlayoff");
    expect(zoneForPosition(9, small, 12)).toBe("relPlayoff");
    expect(zoneForPosition(10, small, 12)).toBe("rel");
  });
});

describe("zonesPresent", () => {
  it("lists the zones in table order for a middle tier", () => {
    expect(zonesPresent(tier2of4, 16)).toEqual([
      "promote",
      "promotePlayoff",
      "relPlayoff",
      "rel",
    ]);
  });

  it("drops promotion for the top flight and relegation for the bottom", () => {
    expect(zonesPresent({ ...tier2of4, tier: 1 }, 16)).toEqual([
      "relPlayoff",
      "rel",
    ]);
    expect(zonesPresent({ ...tier2of4, tier: 4 }, 16)).toEqual([
      "promote",
      "promotePlayoff",
    ]);
  });
});

describe("resolveZoneModel", () => {
  it("uses the row count when the league reports no capacity", () => {
    expect(resolveZoneModel(null, 18).maxTeams).toBe(18);
  });

  it("keeps the declared capacity when there is one", () => {
    expect(resolveZoneModel(tier2of4, 4).maxTeams).toBe(16);
  });
});
