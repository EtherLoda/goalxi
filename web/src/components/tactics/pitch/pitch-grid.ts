/**
 * pitch-grid.ts — shared pitch coordinate + zone helpers.
 */
import { PITCH_COORDS, PITCH_SLOTS, type PitchSlot, type PositionZone, PITCH_ZONE } from '../types';

export { PITCH_COORDS, PITCH_SLOTS };
export type { PitchSlot };

export function getZone(slot: PitchSlot): Exclude<PositionZone, 'bench'> {
  return PITCH_ZONE[slot];
}

/**
 * Compute translation offsets for the tactical dimensions.
 * - defensiveLine: shifts the back/mid/forward lines up or down
 * - pitchWidth: scales the X-axis (wide → players spread out)
 *
 * The returned object is meant to be spread onto a `transform` style.
 */
export interface DimensionOffsets {
  translateY: number;  // -8 to +8 (% of pitch height)
  scaleX: number;      // 0.92 to 1.10
}

export function computeDimensionOffsets(
  defensiveLine: 'low' | 'mid' | 'high',
  pitchWidth: 'narrow' | 'balanced' | 'wide',
): DimensionOffsets {
  const translateY =
    defensiveLine === 'low' ? 6 : defensiveLine === 'high' ? -6 : 0;
  const scaleX = pitchWidth === 'narrow' ? 0.92 : pitchWidth === 'wide' ? 1.1 : 1;
  return { translateY, scaleX };
}
