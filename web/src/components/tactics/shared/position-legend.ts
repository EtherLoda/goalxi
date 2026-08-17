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

/**
 * New senior canonical keys (post commit 2 of the position-key
 * unification plan) folded to the FE's 24-slot `PositionKey` set.
 *
 * The FE `PositionKey` union has not been updated yet — it still
 * uses the 3-slot `DMFL/DMF/DMFR` and `CAML/CAM/CAMR` family.
 * Until that lands (commit 3's wider cleanup), historical
 * `match_event.data` rows that carry the new engine-side keys
 * (`AM`/`AML`/`AMR`/`DM`/`DML`/`DMR`) need an in-place fold to
 * the old family so the `SHORT_LABEL` lookup below still hits.
 *
 * Youth editor keys (LCB/RCB/LCM/RCM/CDM1/CDM2/LAM/RAM/CAM/
 * LST/RST/ST) are already folded by `LEGACY_SLOT_ALIASES` in
 * `api-helpers.ts` — the FE side therefore has no youth keys
 * to worry about at the marker layer.
 */
const NEW_TO_OLD_POSITION_KEY: Readonly<Record<string, PositionKey>> = {
  // 3-slot AM family
  AM: 'CAM',
  AML: 'CAML',
  AMR: 'CAMR',
  // 3-slot DM family
  DM: 'DMF',
  DML: 'DMFL',
  DMR: 'DMFR',
};

/**
 * Resolve any string the engine or the historical wire format
 * might emit to a renderable label. The function never throws:
 * unknown keys return `'?' + raw` so a future unknown key shows
 * up in the FE without blanking the bubble.
 *
 * @param slot - any string the engine or wire format emits as a
 *   position key (engine 25-slot canonical, FE 24-slot legacy,
 *   youth editor, historical `CD`/`CDL`/`CDR`, etc.)
 */
export function positionShortLabel(slot: string): string {
  // Step 1: fold new senior canonical keys to the FE's 24-slot
  // family (see the comment above).
  const folded = NEW_TO_OLD_POSITION_KEY[slot] ?? slot;
  // Step 2: lookup in the table.
  if (folded in SHORT_LABEL) {
    return SHORT_LABEL[folded as PositionKey];
  }
  // Step 3: unknown key. Emit a non-empty, debuggable placeholder
  // so the FE never renders an empty bubble for a slot the engine
  // happens to introduce before this file is updated.
  return `?${slot}`;
}
