import { bandSpan, clampValue, panBand } from "./range-slider-math";

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
