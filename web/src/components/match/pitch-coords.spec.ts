/**
 * pitch-coords.spec.ts 鈥?coverage for the match-page pitch coordinate layer.
 *
 * Three pure functions under test:
 *   - slotToMatchCoords:           MATCH_PITCH_COORDS 鈫?home/away coords
 *   - computeMatchDimensionOffsets: defensiveLine/pitchWidth 鈫?translateX + scaleY
 *   - normalizePitchLineup:       raw backend lineup 鈫?canonical pitch slots + bench
 *
 * The match page uses a HORIZONTAL side-by-side layout (home left, away right),
 * whereas the TacticsEditor uses a VERTICAL mirror layout. The two layouts
 * MUST NOT share a coords table 鈥?the editor's vertical layout spreads CBs
 * across two rows so the y-axis (which becomes the x-axis here) saw-tooths
 * between slots. The match page needs every defender on one row, every CM
 * on one row, etc.
 *
 * Side placement is a 180掳 rotation around (50, 50), NOT a horizontal mirror.
 * When the away team attacks LEFT, their "left side" must land at the BOTTOM
 * of the screen 鈥?mirroring only along the centre line would put away's
 * LW/RB on the same screen-side as home's, which is visually wrong.
 */

import { PITCH_SLOTS, BENCH_SLOTS } from '../tactics/types';
import {
  slotToMatchCoords,
  computeMatchDimensionOffsets,
  normalizePitchLineup,
  forfeitScore,
  MATCH_LINE_X,
  MATCH_PITCH_COORDS,
} from './pitch-coords';

// ============================================================================
// slotToMatchCoords
// ============================================================================

describe('slotToMatchCoords', () => {
  describe('line alignment 鈥?same x for every slot in a tactical line', () => {
    // The headline invariant of the match page: players who play the same
    // tactical line stand on the same x-coordinate so they render in a row
    // on the horizontal pitch. The bug report that motivated this layer
    // was that LB/CBL/CB/CBR/RB were saw-toothed (x = 24, 22, 20, 22, 24).

    it('GK line: GK sits at MATCH_LINE_X.GK on the home side', () => {
      const gk = slotToMatchCoords('GK', 'home');
      expect(gk.x).toBe(MATCH_LINE_X.GK);
      expect(gk.y).toBe(50);
    });

    it('defensive line: LB / CBL / CB / CBR / RB all share x = MATCH_LINE_X.DEF', () => {
      const line: Array<'LB' | 'CBL' | 'CB' | 'CBR' | 'RB'> = [
        'LB', 'CBL', 'CB', 'CBR', 'RB',
      ];
      const xs = line.map((s) => slotToMatchCoords(s, 'home').x);
      expect(new Set(xs)).toEqual(new Set([MATCH_LINE_X.DEF]));
    });

    it('defensive line slots are spread across y (top 鈫?bottom: LB, CBL, CB, CBR, RB)', () => {
      expect(slotToMatchCoords('LB', 'home').y).toBeLessThan(slotToMatchCoords('CBL', 'home').y);
      expect(slotToMatchCoords('CBL', 'home').y).toBeLessThan(slotToMatchCoords('CB', 'home').y);
      expect(slotToMatchCoords('CB', 'home').y).toBeLessThan(slotToMatchCoords('CBR', 'home').y);
      expect(slotToMatchCoords('CBR', 'home').y).toBeLessThan(slotToMatchCoords('RB', 'home').y);
    });

    it('DM line: LWB / DMFL / DMF / DMFR / RWB all share x = MATCH_LINE_X.DM', () => {
      const line: Array<'LWB' | 'DMFL' | 'DMF' | 'DMFR' | 'RWB'> = [
        'LWB', 'DMFL', 'DMF', 'DMFR', 'RWB',
      ];
      const xs = line.map((s) => slotToMatchCoords(s, 'home').x);
      expect(new Set(xs)).toEqual(new Set([MATCH_LINE_X.DM]));
    });

    it('DM line: wing-backs sit wider than the central DMs', () => {
      const lwb = slotToMatchCoords('LWB', 'home').y;
      const dmf1 = slotToMatchCoords('DMFL', 'home').y;
      const rwb = slotToMatchCoords('RWB', 'home').y;
      expect(lwb).toBeLessThan(dmf1);
      expect(rwb).toBeGreaterThan(dmf1);
    });

    it('CM line: LM / CML / CM / CMR / RM all share x = MATCH_LINE_X.CM', () => {
      const line: Array<'LM' | 'CML' | 'CM' | 'CMR' | 'RM'> = [
        'LM', 'CML', 'CM', 'CMR', 'RM',
      ];
      const xs = line.map((s) => slotToMatchCoords(s, 'home').x);
      expect(new Set(xs)).toEqual(new Set([MATCH_LINE_X.CM]));
    });

    it('AM line: LW / CAML / CAM / CAMR / RW all share x = MATCH_LINE_X.AM', () => {
      const line: Array<'LW' | 'CAML' | 'CAM' | 'CAMR' | 'RW'> = [
        'LW', 'CAML', 'CAM', 'CAMR', 'RW',
      ];
      const xs = line.map((s) => slotToMatchCoords(s, 'home').x);
      expect(new Set(xs)).toEqual(new Set([MATCH_LINE_X.AM]));
    });

    it('FW line: CFL / CF / CFR all share x = MATCH_LINE_X.FW', () => {
      const line: Array<'CFL' | 'CF' | 'CFR'> = ['CFL', 'CF', 'CFR'];
      const xs = line.map((s) => slotToMatchCoords(s, 'home').x);
      expect(new Set(xs)).toEqual(new Set([MATCH_LINE_X.FW]));
    });

    it('FW line slots are spread across y (CFL, CF, CFR)', () => {
      expect(slotToMatchCoords('CFL', 'home').y).toBeLessThan(slotToMatchCoords('CF', 'home').y);
      expect(slotToMatchCoords('CF', 'home').y).toBeLessThan(slotToMatchCoords('CFR', 'home').y);
    });

    it('lines are ordered GK 鈫?DEF 鈫?DM 鈫?CM 鈫?AM 鈫?FW (each step forward)', () => {
      expect(MATCH_LINE_X.GK).toBeLessThan(MATCH_LINE_X.DEF);
      expect(MATCH_LINE_X.DEF).toBeLessThan(MATCH_LINE_X.DM);
      expect(MATCH_LINE_X.DM).toBeLessThan(MATCH_LINE_X.CM);
      expect(MATCH_LINE_X.CM).toBeLessThan(MATCH_LINE_X.AM);
      expect(MATCH_LINE_X.AM).toBeLessThan(MATCH_LINE_X.FW);
    });

    it('CF is at the front (most forward for home), not between GK and CB', () => {
      const cfX = slotToMatchCoords('CF', 'home').x;
      const gkX = slotToMatchCoords('GK', 'home').x;
      const cbX = slotToMatchCoords('CB', 'home').x;
      // CF must be further FORWARD than both GK and CB.
      expect(cfX).toBeGreaterThan(gkX);
      expect(cfX).toBeGreaterThan(cbX);
      // CF must be the most-forward line in the whole pitch.
      const allXs = PITCH_SLOTS.map((s) => slotToMatchCoords(s, 'home').x);
      expect(cfX).toBe(Math.max(...allXs));
    });
  });

  describe('180掳 rotation invariants', () => {
    it('rotates each slot 180掳 around the pitch centre (away = 100 - home on both axes)', () => {
      // For every slot: home coords + away coords are 180掳 rotations around (50, 50).
      // Equivalently, away.x === 100 - home.x AND away.y === 100 - home.y.
      // The y-flip is what makes away's "left" (LW, LB, LM) land at the BOTTOM
      // of the screen when away attacks LEFT.
      for (const slot of PITCH_SLOTS) {
        const home = slotToMatchCoords(slot, 'home');
        const away = slotToMatchCoords(slot, 'away');
        expect(away.x).toBe(100 - home.x);
        expect(away.y).toBe(100 - home.y);
      }
    });

    it('y range is always within [0, 100] for every slot/side', () => {
      for (const slot of PITCH_SLOTS) {
        const home = slotToMatchCoords(slot, 'home');
        const away = slotToMatchCoords(slot, 'away');
        expect(home.y).toBeGreaterThanOrEqual(0);
        expect(home.y).toBeLessThanOrEqual(100);
        expect(away.y).toBeGreaterThanOrEqual(0);
        expect(away.y).toBeLessThanOrEqual(100);
      }
    });

    it('x range is always within [0, 100] for every slot/side', () => {
      for (const slot of PITCH_SLOTS) {
        const home = slotToMatchCoords(slot, 'home');
        const away = slotToMatchCoords(slot, 'away');
        expect(home.x).toBeGreaterThanOrEqual(0);
        expect(home.x).toBeLessThanOrEqual(100);
        expect(away.x).toBeGreaterThanOrEqual(0);
        expect(away.x).toBeLessThanOrEqual(100);
      }
    });
  });

  describe('half restriction 鈥?each team stays in its own half', () => {
    it('every home slot is inside the home half (x 鈭?[0, 50])', () => {
      for (const slot of PITCH_SLOTS) {
        const home = slotToMatchCoords(slot, 'home');
        expect(home.x).toBeGreaterThanOrEqual(0);
        expect(home.x).toBeLessThanOrEqual(50);
      }
    });

    it('every away slot is inside the away half (x 鈭?[50, 100])', () => {
      for (const slot of PITCH_SLOTS) {
        const away = slotToMatchCoords(slot, 'away');
        expect(away.x).toBeGreaterThanOrEqual(50);
        expect(away.x).toBeLessThanOrEqual(100);
      }
    });

    it('home FW line is the closest home slot to the center circle, 6 units shy of x=50', () => {
      const fwX = slotToMatchCoords('CF', 'home').x;
      expect(fwX).toBe(44);
      // No home slot is closer to the halfway line than FW.
      const homeXs = PITCH_SLOTS.map((s) => slotToMatchCoords(s, 'home').x);
      expect(fwX).toBe(Math.max(...homeXs));
    });

    it('away FW line is the closest away slot to the center circle, 6 units past x=50', () => {
      const fwX = slotToMatchCoords('CF', 'away').x;
      expect(fwX).toBe(56);
      // No away slot is closer to the halfway line than FW.
      const awayXs = PITCH_SLOTS.map((s) => slotToMatchCoords(s, 'away').x);
      expect(fwX).toBe(Math.min(...awayXs));
    });

    it('home GK is the leftmost home slot (closest to home goal), away GK is rightmost', () => {
      const gkHome = slotToMatchCoords('GK', 'home').x;
      const gkAway = slotToMatchCoords('GK', 'away').x;
      const homeXs = PITCH_SLOTS.map((s) => slotToMatchCoords(s, 'home').x);
      const awayXs = PITCH_SLOTS.map((s) => slotToMatchCoords(s, 'away').x);
      expect(gkHome).toBe(Math.min(...homeXs));
      expect(gkAway).toBe(Math.max(...awayXs));
    });

    it('home and away FW lines straddle the halfway line (44 鈫?56, 12 units apart)', () => {
      const homeFw = slotToMatchCoords('CF', 'home').x;
      const awayFw = slotToMatchCoords('CF', 'away').x;
      // 12-unit gap leaves room for both trios to render at the scaled
      // marker size without overlap.
      expect(awayFw - homeFw).toBe(12);
    });
  });

  describe('goal placement', () => {
    it('home GK hugs the LEFT edge of the pitch (near home goal)', () => {
      const homeGk = slotToMatchCoords('GK', 'home');
      expect(homeGk.x).toBeLessThan(10);
    });

    it('away GK hugs the RIGHT edge of the pitch (near away goal)', () => {
      const awayGk = slotToMatchCoords('GK', 'away');
      expect(awayGk.x).toBeGreaterThan(90);
    });

    it('home CF is the most forward home slot, just inside the home half (closest to center circle)', () => {
      const homeCf = slotToMatchCoords('CF', 'home');
      // CF must be inside home's half, and the closest to x=50 of any
      // home slot. NOT at the opponent's goal 鈥?the half-restricted
      // layout stops strikers from crossing the halfway line.
      expect(homeCf.x).toBeLessThan(50);
      const homeXs = PITCH_SLOTS.map((s) => slotToMatchCoords(s, 'home').x);
      expect(homeCf.x).toBe(Math.max(...homeXs));
    });

    it('away CF is the most forward away slot, just inside the away half', () => {
      const awayCf = slotToMatchCoords('CF', 'away');
      expect(awayCf.x).toBeGreaterThan(50);
      const awayXs = PITCH_SLOTS.map((s) => slotToMatchCoords(s, 'away').x);
      expect(awayCf.x).toBe(Math.min(...awayXs));
    });
  });

  describe('attacking direction', () => {
    it('home attackers (CAML-3, CF, CFL, CFR, LW, RW) sit in the home half, closest to the center circle', () => {
      // In the half-restricted layout, "attacking" doesn't mean crossing
      // into the opponent's half 鈥?home's FW line is the most forward
      // home position, just 6 units shy of x=50.
      const attackers = ['CAML', 'CAM', 'CAMR', 'CF', 'CFL', 'CFR', 'LW', 'RW'] as const;
      for (const s of attackers) {
        const x = slotToMatchCoords(s, 'home').x;
        expect(x).toBeLessThan(50);
      }
      // And the CF line is the most forward home position of them all.
      const homeAttackerXs = attackers.map((s) => slotToMatchCoords(s, 'home').x);
      const fwX = slotToMatchCoords('CF', 'home').x;
      expect(fwX).toBe(Math.max(...homeAttackerXs));
    });

    it('away attackers (CAML-3, CF, CFL, CFR, LW, RW) sit in the away half, closest to the center circle', () => {
      const attackers = ['CAML', 'CAM', 'CAMR', 'CF', 'CFL', 'CFR', 'LW', 'RW'] as const;
      for (const s of attackers) {
        const x = slotToMatchCoords(s, 'away').x;
        expect(x).toBeGreaterThan(50);
      }
      const awayAttackerXs = attackers.map((s) => slotToMatchCoords(s, 'away').x);
      const fwX = slotToMatchCoords('CF', 'away').x;
      expect(fwX).toBe(Math.min(...awayAttackerXs));
    });
  });

  describe('broadcast convention 鈥?away "left" lands at the BOTTOM of the screen', () => {
    it('away LB / LM / LW / LWB sit at the BOTTOM (high y) of the screen', () => {
      const leftSlots = ['LB', 'LM', 'LW', 'LWB'] as const;
      for (const s of leftSlots) {
        const home = slotToMatchCoords(s, 'home');
        const away = slotToMatchCoords(s, 'away');
        // Home's "left" sits at the TOP of the screen (low y).
        expect(home.y).toBeLessThan(50);
        // Away's "left" sits at the BOTTOM of the screen (high y).
        expect(away.y).toBeGreaterThan(50);
      }
    });

    it('away RB / RM / RW / RWB sit at the TOP (low y) of the screen', () => {
      const rightSlots = ['RB', 'RM', 'RW', 'RWB'] as const;
      for (const s of rightSlots) {
        const home = slotToMatchCoords(s, 'home');
        const away = slotToMatchCoords(s, 'away');
        // Home's "right" sits at the BOTTOM of the screen (high y).
        expect(home.y).toBeGreaterThan(50);
        // Away's "right" sits at the TOP of the screen (low y).
        expect(away.y).toBeLessThan(50);
      }
    });
  });

  describe('agrees with MATCH_PITCH_COORDS table', () => {
    it('home side returns MATCH_PITCH_COORDS[slot] verbatim', () => {
      for (const slot of PITCH_SLOTS) {
        expect(slotToMatchCoords(slot, 'home')).toEqual(MATCH_PITCH_COORDS[slot]);
      }
    });
  });
});

// ============================================================================
// computeMatchDimensionOffsets
// ============================================================================

describe('computeMatchDimensionOffsets', () => {
  describe('defensiveLine translation', () => {
    it('high line pushes home team FORWARD (toward right, +X)', () => {
      const home = computeMatchDimensionOffsets('high', 'balanced', 'home');
      expect(home.translateX).toBeGreaterThan(0);
      expect(home.translateX).toBe(6);
    });

    it('high line pushes away team FORWARD (toward left, -X)', () => {
      const away = computeMatchDimensionOffsets('high', 'balanced', 'away');
      expect(away.translateX).toBeLessThan(0);
      expect(away.translateX).toBe(-6);
    });

    it('low line drops home team BACK (toward left, -X)', () => {
      const home = computeMatchDimensionOffsets('low', 'balanced', 'home');
      expect(home.translateX).toBeLessThan(0);
      expect(home.translateX).toBe(-6);
    });

    it('low line drops away team BACK (toward right, +X)', () => {
      const away = computeMatchDimensionOffsets('low', 'balanced', 'away');
      expect(away.translateX).toBeGreaterThan(0);
      expect(away.translateX).toBe(6);
    });

    it('mid line yields zero translation for both sides', () => {
      expect(computeMatchDimensionOffsets('mid', 'balanced', 'home').translateX).toBe(0);
      expect(computeMatchDimensionOffsets('mid', 'balanced', 'away').translateX).toBe(0);
    });

    it('home + away signs always oppose (one pushes forward, other backward)', () => {
      const cases: Array<'low' | 'mid' | 'high'> = ['low', 'mid', 'high'];
      for (const dl of cases) {
        const home = computeMatchDimensionOffsets(dl, 'balanced', 'home');
        const away = computeMatchDimensionOffsets(dl, 'balanced', 'away');
        expect(home.translateX + away.translateX).toBe(0);
      }
    });
  });

  describe('pitchWidth scaling', () => {
    it('wide scales the Y axis (width axis in horizontal layout)', () => {
      expect(computeMatchDimensionOffsets('mid', 'wide', 'home').scaleY).toBe(1.1);
      expect(computeMatchDimensionOffsets('mid', 'wide', 'away').scaleY).toBe(1.1);
    });

    it('narrow compresses the Y axis', () => {
      expect(computeMatchDimensionOffsets('mid', 'narrow', 'home').scaleY).toBe(0.92);
      expect(computeMatchDimensionOffsets('mid', 'narrow', 'away').scaleY).toBe(0.92);
    });

    it('balanced produces scale 1', () => {
      expect(computeMatchDimensionOffsets('mid', 'balanced', 'home').scaleY).toBe(1);
      expect(computeMatchDimensionOffsets('mid', 'balanced', 'away').scaleY).toBe(1);
    });

    it('scaleY is identical for home and away (same dimension for both)', () => {
      const home = computeMatchDimensionOffsets('high', 'wide', 'home');
      const away = computeMatchDimensionOffsets('high', 'wide', 'away');
      expect(home.scaleY).toBe(away.scaleY);
    });
  });
});

// ============================================================================
// normalizePitchLineup
// ============================================================================

describe('normalizePitchLineup', () => {
  it('returns empty maps for empty input', () => {
    const result = normalizePitchLineup({});
    expect(result.pitch).toEqual({});
    expect(result.bench).toEqual({});
  });

  it('keeps canonical pitch slots untouched', () => {
    const result = normalizePitchLineup({
      GK: 400_001,
      CBL: 400_002,
      CB: 400_003,
      CBR: 400_004,
      CML: 400_006,
      CF: 400_007,
    });
    expect(result.pitch.GK).toBe(400_001);
    expect(result.pitch.CBL).toBe(400_002);
    expect(result.pitch.CB).toBe(400_003);
    expect(result.pitch.CBR).toBe(400_004);
    expect(result.pitch.CML).toBe(400_006);
    expect(result.pitch.CF).toBe(400_007);
    expect(result.bench).toEqual({});
  });

  it('maps legacy aliases to canonical pitch slots (last-write-wins)', () => {
    // Multiple aliases may target the same canonical slot. The existing
    // normalizeLineup is last-write-wins 鈥?a single slot can hold only one
    // playerId. We pin that behaviour so a regression here is loud.
    const result = normalizePitchLineup({
      CB: 400_002,     // 鈫?CBL
      CD: 400_003,     // 鈫?CB
      CDR: 400_004,    // 鈫?CBR
      CDL: 400_005,   // 鈫?CBL (overwrites the earlier CB鈫扖BL entry)
    });
    expect(result.pitch.CBL).toBe(400_005);
    expect(result.pitch.CB).toBe(400_003);
    expect(result.pitch.CBR).toBe(400_004);
  });

  it('folds DM / DMR / CDM aliases onto the central midfield family', () => {
    // Note: 'CM' is now a canonical pitch slot, so the legacy CM->CML
    // aliasing is a no-op (CM passes through). 'CD' / 'CDL' / 'CDR' and
    // 'DM' / 'DMR' / 'CDM' are the non-canonical codes the legacy map
    // still folds; we cover those here.
    const result = normalizePitchLineup({
      DM: 400_008,     // -> DMFL
      DMR: 400_009,    // -> DMFR
      CDM: 400_010,    // -> DMF
    });
    expect(result.pitch.DMFL).toBe(400_008);
    expect(result.pitch.DMFR).toBe(400_009);
    expect(result.pitch.DMF).toBe(400_010);
  });

  it('preserves bench slots verbatim', () => {
    const result = normalizePitchLineup({
      GK: 400_001,
      BENCH_GK: 400_012,
      BENCH_CB: 400_013,
      BENCH_FW: 400_014,
    });
    expect(result.bench.BENCH_GK).toBe(400_012);
    expect(result.bench.BENCH_CB).toBe(400_013);
    expect(result.bench.BENCH_FW).toBe(400_014);
    expect(result.pitch.GK).toBe(400_001);
  });

  it('handles a full 4-3-3 lineup without dropping any slot', () => {
    const lineup = {
      GK: 400_030,
      LB: 400_031, CBL: 400_032, CB: 400_033, RB: 400_034,
      CML: 400_035, CM: 400_036, CMR: 400_037,
      LW: 400_038, CF: 400_039, RW: 400_040,
    };
    const result = normalizePitchLineup(lineup);
    // Each pitch slot must resolve to a playerId.
    let filledSlots = 0;
    for (const slot of PITCH_SLOTS) {
      if (result.pitch[slot]) filledSlots++;
    }
    expect(filledSlots).toBe(Object.keys(lineup).length);
  });

  it('a 3-5-2 with wing-backs produces LWB + RWB in pitch slots', () => {
    const lineup = {
      GK: 400_030,
      CBL: 400_041, CB: 400_042, CBR: 400_043,
      LWB: 400_038, CML: 400_035, CM: 400_036, CMR: 400_037, RWB: 400_040,
      CFL: 400_046, CFR: 400_047,
    };
    const result = normalizePitchLineup(lineup);
    expect(result.pitch.LWB).toBe(400_038);
    expect(result.pitch.RWB).toBe(400_040);
    expect(result.pitch.CFL).toBe(400_046);
    expect(result.pitch.CFR).toBe(400_047);
  });

  it('drops slots that cannot be mapped (defensive - silent drop)', () => {
    const result = normalizePitchLineup({
      GK: 400_030,
      UNKNOWN_SLOT: 400_015,
      ANOTHER_BAD: 400_016,
    });
    expect(result.pitch.GK).toBe(400_030);
    // Unknown slots are silently dropped 鈥?no keys leak into pitch/bench.
    expect(Object.keys(result.pitch)).toEqual(['GK']);
    expect(Object.keys(result.bench)).toEqual([]);
  });

  it('all six bench slot types survive normalization', () => {
    const result = normalizePitchLineup({
      BENCH_GK: 400_020,
      BENCH_CB: 400_021,
      BENCH_FB: 400_022,
      BENCH_W: 400_023,
      BENCH_CM: 400_024,
      BENCH_FW: 400_025,
    });
    expect(Object.keys(result.bench).sort()).toEqual([...BENCH_SLOTS].sort());
  });
});

// ============================================================================
// forfeitScore 鈥?mirror of simulator/processor.ts handleRosterForfeit rule.
// ============================================================================

describe('forfeitScore', () => {
  it('both teams forfeit 鈫?0-0', () => {
    expect(forfeitScore(true, true)).toEqual({ home: 0, away: 0 });
  });

  it('home forfeit, away intact 鈫?0-3 (away wins)', () => {
    expect(forfeitScore(true, false)).toEqual({ home: 0, away: 3 });
  });

  it('away forfeit, home intact 鈫?3-0 (home wins)', () => {
    expect(forfeitScore(false, true)).toEqual({ home: 3, away: 0 });
  });
});