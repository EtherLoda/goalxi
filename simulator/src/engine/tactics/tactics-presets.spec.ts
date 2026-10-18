import { PitchWidth, DefensiveLine } from '../types/tactics-config';
import {
  WIDTH_MODIFIERS,
  DEFENSIVE_LINE_MODIFIERS,
  DEFAULT_TACTICS,
} from './tactics-presets';

describe('Tactics Presets', () => {
  describe('WIDTH_MODIFIERS', () => {
    it('should have NARROW with center boost and flank weaken', () => {
      const mods = WIDTH_MODIFIERS[PitchWidth.NARROW];
      expect(mods.center).toBeGreaterThan(1.0); // Center strengthened
      expect(mods.left).toBeLessThan(1.0); // Flanks weakened
      expect(mods.right).toBeLessThan(1.0); // Flanks weakened
      // NARROW: center ×1.10, flanks ×0.9
      expect(mods.center).toBeCloseTo(1.1, 2);
      expect(mods.left).toBeCloseTo(0.9, 2);
      expect(mods.right).toBeCloseTo(0.9, 2);
    });

    it('should have BALANCED with no modifiers', () => {
      const mods = WIDTH_MODIFIERS[PitchWidth.BALANCED];
      expect(mods.left).toBeCloseTo(1.0, 2);
      expect(mods.center).toBeCloseTo(1.0, 2);
      expect(mods.right).toBeCloseTo(1.0, 2);
    });

    it('should have WIDE with flank boost and center weaken', () => {
      const mods = WIDTH_MODIFIERS[PitchWidth.WIDE];
      expect(mods.left).toBeGreaterThan(1.0); // Flanks strengthened
      expect(mods.right).toBeGreaterThan(1.0); // Flanks strengthened
      expect(mods.center).toBeLessThan(1.0); // Center weakened
      // WIDE: flanks ×1.07, center ×0.87
      expect(mods.left).toBeCloseTo(1.07, 2);
      expect(mods.center).toBeCloseTo(0.87, 2);
      expect(mods.right).toBeCloseTo(1.07, 2);
    });

    it('NARROW center boost should exceed WIDE flank boost to compensate for natural 58/42 asymmetry', () => {
      // Center natural probability is 42, flanks are 58
      // NARROW center boost is 10%, WIDE flank boost is 7%
      // This means NARROW is more effective at concentrating through center
      const narrowCenter = WIDTH_MODIFIERS[PitchWidth.NARROW].center;
      const wideFlank = WIDTH_MODIFIERS[PitchWidth.WIDE].left;
      expect(narrowCenter - 1.0).toBeGreaterThan(wideFlank - 1.0);
    });

    it('should have all three lanes for each width', () => {
      for (const width of [
        PitchWidth.NARROW,
        PitchWidth.BALANCED,
        PitchWidth.WIDE,
      ]) {
        const mods = WIDTH_MODIFIERS[width];
        expect(mods).toHaveProperty('left');
        expect(mods).toHaveProperty('center');
        expect(mods).toHaveProperty('right');
      }
    });
  });

  describe('DEFENSIVE_LINE_MODIFIERS', () => {
    it('should have LOW with minimal offside probability and defensive boost', () => {
      const mods = DEFENSIVE_LINE_MODIFIERS[DefensiveLine.LOW];
      expect(mods.offsideProb).toBeCloseTo(0.01, 2);
      expect(mods.attackMult).toBeLessThan(1.0);
      expect(mods.defenseMult).toBeGreaterThan(1.0);
      expect(mods.attackMult).toBeCloseTo(0.92, 2);
      expect(mods.defenseMult).toBeCloseTo(1.11, 2);
    });

    it('should have MID with baseline values', () => {
      const mods = DEFENSIVE_LINE_MODIFIERS[DefensiveLine.MID];
      expect(mods.offsideProb).toBeCloseTo(0.04, 2);
      expect(mods.attackMult).toBeCloseTo(1.0, 1);
      expect(mods.defenseMult).toBeCloseTo(1.0, 1);
    });

    it('should have HIGH with high offside probability and attack boost', () => {
      const mods = DEFENSIVE_LINE_MODIFIERS[DefensiveLine.HIGH];
      expect(mods.offsideProb).toBeCloseTo(0.15, 2);
      expect(mods.attackMult).toBeGreaterThan(1.0);
      expect(mods.defenseMult).toBeLessThan(1.0);
      expect(mods.attackMult).toBeCloseTo(1.08, 2);
      expect(mods.defenseMult).toBeCloseTo(0.89, 2);
    });

    it('should have all required properties for each line', () => {
      for (const line of [
        DefensiveLine.LOW,
        DefensiveLine.MID,
        DefensiveLine.HIGH,
      ]) {
        const mods = DEFENSIVE_LINE_MODIFIERS[line];
        expect(mods).toHaveProperty('offsideProb');
        expect(mods).toHaveProperty('attackMult');
        expect(mods).toHaveProperty('defenseMult');
        expect(mods.offsideProb).toBeGreaterThanOrEqual(0);
        expect(mods.offsideProb).toBeLessThanOrEqual(1);
      }
    });
  });

  describe('DEFAULT_TACTICS', () => {
    it('should have BALANCED values for all dimensions', () => {
      expect(DEFAULT_TACTICS.pitchWidth).toBe(PitchWidth.BALANCED);
      expect(DEFAULT_TACTICS.defensiveLine).toBe(DefensiveLine.MID);
    });

    // Tempo（比赛节奏）2026-10-18 整体移除。这条断言是防回退的绊线：
    // 一旦有人把 tempo 加回 TacticsConfig，这里会先红。
    it('no longer carries a tempo dimension', () => {
      expect(Object.keys(DEFAULT_TACTICS).sort()).toEqual([
        'defensiveLine',
        'pitchWidth',
      ]);
    });
  });
});
