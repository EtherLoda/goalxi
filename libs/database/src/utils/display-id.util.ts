import { createHash } from 'crypto';

/**
 * Display ID for player-facing identifiers.
 *
 * Layout: 11 decimal digits (0..99,999,999,999).
 * Algorithm: SHA-256(uuid) → first 8 bytes → bigint → mod 10^11.
 * Deterministic: the same UUID always maps to the same number.
 *
 * Capacity: 100B. Collision probability via the birthday paradox stays
 * well under 0.5 for up to ~1.5M players — and the migration + service
 * layer both linear-probe on conflict, so even collisions are invisible
 * to callers.
 */

export const DISPLAY_ID_LENGTH = 11;
export const DISPLAY_ID_MAX = 10n ** BigInt(DISPLAY_ID_LENGTH);

const DISPLAY_ID_REGEX = /^\d{11}$/;
const HEX_PREFIX_LEN = 16; // 8 bytes = 16 hex chars

/** Pure: UUID → bigint in [0, 10^11). No DB access. */
export function displayIdFromUuid(uuid: string): bigint {
    const hex = createHash('sha256').update(uuid).digest('hex').slice(0, HEX_PREFIX_LEN);
    return BigInt('0x' + hex) % DISPLAY_ID_MAX;
}

/** bigint → 11-char zero-padded string. */
export function formatDisplayId(id: bigint): string {
    return id.toString().padStart(DISPLAY_ID_LENGTH, '0');
}

/** True iff `s` is exactly 11 decimal digits. */
export function isValidDisplayId(s: string): boolean {
    return DISPLAY_ID_REGEX.test(s);
}

/** '12345678901' → 12345678901n; invalid input → null. */
export function parseDisplayId(s: string): bigint | null {
    if (!isValidDisplayId(s)) return null;
    return BigInt(s);
}

/**
 * Pick a free 11-digit display ID for the given UUID, linear-probing on
 * conflict. Throws if no free slot is found within `maxAttempts`.
 */
export async function generateUniqueDisplayId(
    uuid: string,
    exists: (id: bigint) => Promise<boolean>,
    maxAttempts: number = 1000,
): Promise<bigint> {
    if (maxAttempts <= 0) {
        throw new Error('maxAttempts must be positive');
    }
    const start = displayIdFromUuid(uuid);
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        const candidate = (start + BigInt(attempt)) % DISPLAY_ID_MAX;
        // eslint-disable-next-line no-await-in-loop
        const taken = await exists(candidate);
        if (!taken) {
            return candidate;
        }
    }
    throw new Error(
        `Failed to generate a unique display ID after ${maxAttempts} attempts`,
    );
}
