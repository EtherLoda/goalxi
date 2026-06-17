'use client';

/**
 * position-legend — converts a position key to its abbreviated label
 * used as the slot's default marker text on the pitch.
 */
import type { PositionKey } from '../types';

const SHORT_LABEL: Record<PositionKey, string> = {
  GK: 'GK',
  CB1: 'CB', CB2: 'CB', CB3: 'CB',
  LB: 'LB', RB: 'RB',
  LWB: 'LWB', RWB: 'RWB',
  DMF1: 'DMF', DMF2: 'DMF', DMF3: 'DMF',
  CM1: 'CM', CM2: 'CM', CM3: 'CM',
  CAM1: 'CAM', CAM2: 'CAM', CAM3: 'CAM',
  LM: 'LM', RM: 'RM',
  LW: 'LW', RW: 'RW',
  CFL: 'CFL', CF: 'CF', CFR: 'CFR',
  BENCH_GK: 'GK', BENCH_CB: 'CB', BENCH_FB: 'FB',
  BENCH_W: 'W', BENCH_CM: 'CM', BENCH_FW: 'FW',
};

export function positionShortLabel(slot: PositionKey): string {
  return SHORT_LABEL[slot];
}
