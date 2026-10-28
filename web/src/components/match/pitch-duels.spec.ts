import { buildDuels, mirrorLane } from "./pitch-duels";
import type { MatchSnapshot } from "./match-pitch-data";

function snapshotWith(
  home: Partial<Record<"left" | "center" | "right", Partial<Record<"atk" | "def" | "pos", number>>>>,
  away: Partial<Record<"left" | "center" | "right", Partial<Record<"atk" | "def" | "pos", number>>>>,
): MatchSnapshot {
  return {
    minute: 30,
    h: {
      ls: {
        left: { atk: 1, def: 2, pos: 3, ...home.left },
        center: { atk: 4, def: 5, pos: 6, ...home.center },
        right: { atk: 7, def: 8, pos: 9, ...home.right },
      } as NonNullable<MatchSnapshot["h"]["ls"]>,
      ps: [],
    },
    a: {
      ls: {
        left: { atk: 10, def: 11, pos: 12, ...away.left },
        center: { atk: 13, def: 14, pos: 15, ...away.center },
        right: { atk: 16, def: 17, pos: 18, ...away.right },
      } as NonNullable<MatchSnapshot["a"]["ls"]>,
      ps: [],
    },
  };
}

const find = (
  zones: ReturnType<typeof buildDuels>,
  column: "homeThird" | "middle" | "awayThird",
  row: "left" | "center" | "right",
) => {
  const zone = zones.find((z) => z.column === column && z.row === row);
  if (!zone) throw new Error(`missing zone ${column}/${row}`);
  return zone;
};

describe("mirrorLane", () => {
  it("puts the home left wing against the away right wing", () => {
    expect(mirrorLane("left")).toBe("right");
    expect(mirrorLane("right")).toBe("left");
    expect(mirrorLane("center")).toBe("center");
  });
});

describe("buildDuels", () => {
  it("returns nine zones in row-major order", () => {
    const zones = buildDuels(snapshotWith({}, {}));
    expect(zones).toHaveLength(9);
    expect(zones.map((z) => `${z.row}/${z.column}`)).toEqual([
      "left/homeThird",
      "left/middle",
      "left/awayThird",
      "center/homeThird",
      "center/middle",
      "center/awayThird",
      "right/homeThird",
      "right/middle",
      "right/awayThird",
    ]);
  });

  it("pairs home defence with away attack in the home third", () => {
    const zone = find(buildDuels(snapshotWith({}, {})), "homeThird", "left");
    expect(zone.homePhase).toBe("def");
    expect(zone.awayPhase).toBe("atk");
    expect(zone.awayLane).toBe("right");
    // home left def = 2, away right atk = 16
    expect(zone.home).toBe(2);
    expect(zone.away).toBe(16);
  });

  it("pairs possession with possession in the middle", () => {
    const zone = find(buildDuels(snapshotWith({}, {})), "middle", "center");
    expect(zone.homePhase).toBe("pos");
    expect(zone.awayPhase).toBe("pos");
    expect(zone.home).toBe(6);
    expect(zone.away).toBe(15);
  });

  it("pairs home attack with away defence in the away third", () => {
    const zone = find(buildDuels(snapshotWith({}, {})), "awayThird", "right");
    expect(zone.homePhase).toBe("atk");
    expect(zone.awayPhase).toBe("def");
    expect(zone.awayLane).toBe("left");
    // home right atk = 7, away left def = 11
    expect(zone.home).toBe(7);
    expect(zone.away).toBe(11);
  });

  it("reads the away side from the mirrored band, not the same key", () => {
    const zones = buildDuels(
      snapshotWith({ right: { atk: 5 } }, { left: { def: 5 }, right: { def: 9 } }),
    );
    // Home right wing meets the away LEFT back (5), never the away right (9).
    expect(find(zones, "awayThird", "right").away).toBe(5);
    expect(find(zones, "awayThird", "right").home).toBe(5);
  });

  it("splits the zone by share of the two ratings", () => {
    const zone = find(buildDuels(snapshotWith({}, {})), "middle", "left");
    // home left pos 3 vs away right pos 18 → 3/21
    expect(zone.homeShare).toBeCloseTo(3 / 21, 6);
  });

  it("falls back to an even split when both ratings are zero", () => {
    const zones = buildDuels(
      snapshotWith({ center: { pos: 0 } }, { center: { pos: 0 } }),
    );
    expect(find(zones, "middle", "center").homeShare).toBe(0.5);
  });

  it("treats a snapshot without lane strengths as all zeroes", () => {
    const zones = buildDuels({ minute: 0, h: { ps: [] }, a: { ps: [] } });
    expect(zones).toHaveLength(9);
    for (const zone of zones) {
      expect(zone.home).toBe(0);
      expect(zone.away).toBe(0);
      expect(zone.homeShare).toBe(0.5);
    }
  });
});
