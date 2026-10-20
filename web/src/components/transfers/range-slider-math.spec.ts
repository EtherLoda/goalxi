import { bandSpan, clampValue, dragEdge, panBand } from "./range-slider-math";

describe("bandSpan", () => {
  it("keeps a legal width unchanged", () => {
    expect(bandSpan(8, 13, 1, 5)).toBe(5);
    expect(bandSpan(8, 10, 1, 5)).toBe(2);
  });

  it("raises a band narrower than the minimum", () => {
    expect(bandSpan(8, 8, 1, 5)).toBe(1);
  });

  it("caps a band wider than the maximum", () => {
    expect(bandSpan(2, 19, 1, 5)).toBe(5);
  });
});

describe("panBand", () => {
  it("moves both edges by the same delta", () => {
    expect(panBand(8, 5, 2, 0, 20)).toBe(10);
    expect(panBand(8, 5, -3, 0, 20)).toBe(5);
  });

  it("preserves the width by construction", () => {
    const lo = panBand(8, 5, 4, 0, 20);
    expect(lo + 5).toBe(17);
  });

  it("stops at the left edge instead of squashing", () => {
    expect(panBand(2, 5, -10, 0, 20)).toBe(0);
  });

  it("stops at the right edge", () => {
    // span 5 on a 0-20 track: the left edge can never exceed 15.
    expect(panBand(13, 5, 10, 0, 20)).toBe(15);
  });

  it("stops at the left edge for a shifted domain (age 15-35)", () => {
    expect(panBand(18, 5, -10, 15, 35)).toBe(15);
    // span 5 on 15-35: the left edge tops out at 30, so 18 + 10 = 28 is still
    // inside the track and must NOT be clamped.
    expect(panBand(18, 5, 10, 15, 35)).toBe(28);
    expect(panBand(18, 5, 20, 15, 35)).toBe(30);
  });

  it("rounds fractional travel to whole steps", () => {
    expect(panBand(8, 5, 1.4, 0, 20)).toBe(9);
    expect(panBand(8, 5, 1.6, 0, 20)).toBe(10);
  });

  it("pins a band that fills the whole track", () => {
    expect(panBand(0, 20, 5, 0, 20)).toBe(0);
  });
});

describe("clampValue", () => {
  it("holds values inside the track", () => {
    expect(clampValue(-3, 0, 20)).toBe(0);
    expect(clampValue(25, 0, 20)).toBe(20);
    expect(clampValue(12, 0, 20)).toBe(12);
  });

  it("works on a shifted domain", () => {
    expect(clampValue(9, 15, 35)).toBe(15);
    expect(clampValue(40, 15, 35)).toBe(35);
  });
});

describe("dragEdge / max thumb", () => {
  const drag = (desired: number, lo = 8, hi = 10) =>
    dragEdge("max", desired, lo, hi, 0, 20, 1, 5);

  it("widens the band while it still can", () => {
    expect(drag(12)).toEqual({ min: 8, max: 12 });
  });

  it("stops widening at the span ceiling", () => {
    expect(drag(13)).toEqual({ min: 8, max: 13 });
  });

  it("slides the band once the ceiling is reached", () => {
    // 8-13 is already 5 wide: the old code returned here and froze the thumb.
    expect(drag(15, 8, 13)).toEqual({ min: 10, max: 15 });
  });

  it("slides until the band meets the right edge", () => {
    expect(drag(25, 15, 20)).toEqual({ min: 15, max: 20 });
  });

  it("shrinks when dragged back inside the span", () => {
    expect(drag(9, 8, 13)).toEqual({ min: 8, max: 9 });
  });

  it("never crosses the left thumb", () => {
    expect(drag(2, 8, 13)).toEqual({ min: 8, max: 9 });
  });

  it("is monotonic, so a drag back does not snap to the start", () => {
    const lows = [13, 15, 18, 15, 14].map((d) => drag(d, 8, 13).min);
    expect(lows).toEqual([8, 10, 13, 10, 9]);
  });
});

describe("dragEdge / min thumb", () => {
  const drag = (desired: number, lo = 10, hi = 13) =>
    dragEdge("min", desired, lo, hi, 0, 20, 1, 5);

  it("widens the band while it still can", () => {
    expect(drag(8)).toEqual({ min: 8, max: 13 });
  });

  it("slides the band left once the ceiling is reached", () => {
    expect(drag(5, 8, 13)).toEqual({ min: 5, max: 10 });
  });

  it("slides until the band meets the left edge", () => {
    expect(drag(-3, 0, 5)).toEqual({ min: 0, max: 5 });
  });

  it("shrinks when dragged back inside the span", () => {
    expect(drag(12, 8, 13)).toEqual({ min: 12, max: 13 });
  });

  it("works on a shifted domain (age 15-35)", () => {
    expect(dragEdge("min", 12, 20, 25, 15, 35, 1, 5)).toEqual({ min: 15, max: 20 });
  });
});
