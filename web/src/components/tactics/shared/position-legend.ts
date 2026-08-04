'use client';

/**
 * position-legend — converts a position key to its abbreviated label
 * used as the slot's default marker text on the pitch.
 */
import type { PositionKey } from '../types';

const SHORT_LABEL: Record<PositionKey, string> = {
  GK: 'GK',
  CBL: 'CBL', CB: 'CBC', CBR: 'CBR',
  LB: 'LB', RB: 'RB',
  LWB: 'LWB', RWB: 'RWB',
  DMFL: 'DML', DMF: 'DMC', DMFR: 'DMR',
  CML: 'CML', CM: 'CMC', CMR: 'CMR',
  CAML: 'AML', CAM: 'AMC', CAMR: 'AMR',
  LM: 'LM', RM: 'RM',
  LW: 'LW', RW: 'RW',
  CFL: 'CFL', CF: 'CF', CFR: 'CFR',
  BENCH_GK: 'GK', BENCH_CB: 'CB', BENCH_FB: 'FB',
  BENCH_W: 'W', BENCH_CM: 'CM', BENCH_FW: 'FW',
};

export function positionShortLabel(slot: PositionKey): string {
  return SHORT_LABEL[slot];
}
