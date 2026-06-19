'use client';

/**
 * position-legend — converts a position key to its abbreviated label
 * used as the slot's default marker text on the pitch.
 */
import type { PositionKey } from '../types';

const SHORT_LABEL: Record<PositionKey, string> = {
  GK: 'GK',
  CB1: 'CBL', CB2: 'CBC', CB3: 'CBR',
  LB: 'LB', RB: 'RB',
  LWB: 'LWB', RWB: 'RWB',
  DMF1: 'DML', DMF2: 'DMC', DMF3: 'DMR',
  CM1: 'CML', CM2: 'CMC', CM3: 'CMR',
  CAM1: 'AML', CAM2: 'AMC', CAM3: 'AMR',
  LM: 'LM', RM: 'RM',
  LW: 'LW', RW: 'RW',
  CFL: 'CFL', CF: 'CF', CFR: 'CFR',
  BENCH_GK: 'GK', BENCH_CB: 'CB', BENCH_FB: 'FB',
  BENCH_W: 'W', BENCH_CM: 'CM', BENCH_FW: 'FW',
};

export function positionShortLabel(slot: PositionKey): string {
  return SHORT_LABEL[slot];
}
