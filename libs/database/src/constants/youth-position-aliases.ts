/**
 * Youth editor → senior canonical position key mapping.
 *
 * The web-side `YouthTacticsEditor` uses its own 13-key namespace
 * (LCB/RCB/LCM/RCM/CDM1/CDM2/LAM/RAM/CAM/ST/LST/RST/CB) because
 * youth formations are 1-key-per-slot. When a youth match flows
 * through `SimulationProcessor` and reaches `MatchEngine`, those
 * 13 keys must fold to the senior canonical set in
 * `position-keys.constants.ts` — otherwise the engine reads
 * `unknown positionKey` and returns 0 contribution.
 *
 * This file is the single place those 12 folds live, so the FE
 * doesn't have to mirror the engine's alias table. The engine
 * itself still uses `SLOT_KEY_NORMALIZER` in
 * `simulator/src/engine/utils/attribute-calculator.ts` for the
 * general alias path; this file is the youth-specific pre-pass.
 */
export const YOUTH_POSITION_ALIASES: Readonly<Record<string, string>> = Object.freeze({
    // Centre-back family
    LCB: 'CBL',
    RCB: 'CBR',
    CB: 'CB', // 3-5-2 uses the centre key directly
    // Central midfielder family
    LCM: 'CML',
    CM: 'CM',
    RCM: 'CMR',
    // Defensive midfielder family (CDM1 = left of two DMs, CDM2 = right)
    CDM1: 'DML',
    CDM2: 'DMR',
    // Attacking midfielder family
    LAM: 'AML',
    CAM: 'AM',
    RAM: 'AMR',
    // Forward family. `ST` is intentionally absent — it's a senior
    // 1-slot alias that already folds to `CF` via POSITION_WEIGHTS
    // (see `position-fit.util.ts`'s export map), and `normalizePositionKey`
    // must NOT touch it because engine specs assert the
    // 'returns canonical keys unchanged' contract for `ST`.
    LST: 'CFL',
    RST: 'CFR',
});

/**
 * Fold a youth-editor key to its senior canonical form. Returns
 * the input unchanged when it's already a senior key (so this
 * is safe to call on every position key that enters the engine,
 * youth or otherwise).
 */
export function normalizeYouthPositionKey(slotKey: string): string {
    const mapped = YOUTH_POSITION_ALIASES[slotKey];
    return mapped ?? slotKey;
}
