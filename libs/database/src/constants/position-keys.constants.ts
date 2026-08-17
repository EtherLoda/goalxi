/**
 * Canonical position keys — single source of truth.
 *
 * The 31 keys below are what the rest of the codebase (engine, FE,
 * DB-layer generators, BE validators) should refer to. Anything that
 * is not in this list is either (a) a legacy alias that folds into
 * one of these via `SLOT_KEY_NORMALIZER` in
 * `simulator/src/engine/utils/attribute-calculator.ts`, or (b) a
 * youth-editor-only key with its own fold in
 * `youth-position-aliases.ts`.
 *
 * History: before this constants file existed, the 5 separate
 * position-key namespaces (DB-layer `POSITION_LABELS`, FE `PITCH_SLOTS`,
 * BE validator `VALID_SLOTS`, engine `POSITION_TO_BENCH_KEY`, FE
 * `LEGACY_SLOT_ALIASES`) each carried their own list. Adding a slot
 * meant editing 5 files. This tuple + the derived `PositionKey` /
 * `BenchKey` unions + the `isPitchKey` / `isBenchKey` guards give us
 * one place to add or rename a slot.
 *
 * Renames that landed alongside this file (commit 2 of the position-
 * key unification plan):
 *   - `CAM` → `AM` (3-slot attacking-mid centre)
 *   - `CAML` → `AML` (3-slot attacking-mid left)
 *   - `CAMR` → `AMR` (3-slot attacking-mid right)
 *   - `CDM` → `DM` (3-slot defensive-mid centre)
 *   - `DMF` → `DM` (3-slot defensive-mid centre; folded to `DM`)
 *   - `DMFL` → `DML` (3-slot defensive-mid left)
 *   - `DMFR` → `DMR` (3-slot defensive-mid right)
 * The old names are kept as `SLOT_KEY_NORMALIZER` aliases so historical
 * `match_tactics.lineupV2` JSONB rows and saved team data still load.
 */
export const POSITION_KEYS = [
    // 3-slot centre-back
    'CBL',
    'CB',
    'CBR',
    // Wide full-backs
    'LB',
    'RB',
    'LWB',
    'RWB',
    // 3-slot defensive midfielder (renamed from CDM/DMF/DMFL/DMFR)
    'DML',
    'DM',
    'DMR',
    // 3-slot central midfielder
    'CML',
    'CM',
    'CMR',
    // 3-slot attacking midfielder (renamed from CAM/CAML/CAMR)
    'AML',
    'AM',
    'AMR',
    // Wide midfielders
    'LM',
    'RM',
    // Wingers
    'LW',
    'RW',
    // 3-slot centre-forward
    'CFL',
    'CF',
    'CFR',
    // Goalkeeper
    'GK',
] as const;

export type PositionKey = (typeof POSITION_KEYS)[number];

export const BENCH_KEYS = [
    'BENCH_GK',
    'BENCH_CB',
    'BENCH_FB',
    'BENCH_W',
    'BENCH_CM',
    'BENCH_FW',
] as const;

export type BenchKey = (typeof BENCH_KEYS)[number];

export const ALL_POSITION_KEYS = [...POSITION_KEYS, ...BENCH_KEYS] as const;
export type AllPositionKey = (typeof ALL_POSITION_KEYS)[number];

const POSITION_KEY_SET: ReadonlySet<string> = new Set(POSITION_KEYS);
const BENCH_KEY_SET: ReadonlySet<string> = new Set(BENCH_KEYS);

export function isPitchKey(key: string): key is PositionKey {
    return POSITION_KEY_SET.has(key);
}

export function isBenchKey(key: string): key is BenchKey {
    return BENCH_KEY_SET.has(key);
}

export function isAllPositionKey(key: string): key is AllPositionKey {
    return POSITION_KEY_SET.has(key) || BENCH_KEY_SET.has(key);
}
