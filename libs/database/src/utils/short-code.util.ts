import { randomInt } from 'crypto';

/**
 * Short-code alphabet for human-facing identifiers (e.g. team codes).
 *
 * Excludes visually ambiguous characters:
 *   - 0 (zero) vs O
 *   - 1 (one)  vs I vs L
 *
 * Result: 24 letters + 8 digits = 32 chars; 32^5 ≈ 33.5M unique codes.
 */
export const SHORT_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export const SHORT_CODE_LENGTH = 5;

const SHORT_CODE_REGEX = new RegExp(`^[${SHORT_CODE_ALPHABET}]{${SHORT_CODE_LENGTH}}$`, 'i');

/**
 * Pure generation — does NOT check uniqueness. Use {@link generateUniqueShortCode}
 * when persisting to a unique-indexed column.
 */
export function generateShortCode(length: number = SHORT_CODE_LENGTH): string {
    if (length <= 0) {
        throw new Error('shortCode length must be positive');
    }
    let out = '';
    for (let i = 0; i < length; i++) {
        const idx = randomInt(0, SHORT_CODE_ALPHABET.length);
        out += SHORT_CODE_ALPHABET[idx];
    }
    return out;
}

/**
 * Generate a short code guaranteed to be unique according to `exists`.
 *
 * @param exists async predicate that returns true if the candidate is taken
 * @param maxAttempts safety cap; throws if all attempts collide
 */
export async function generateUniqueShortCode(
    exists: (code: string) => Promise<boolean>,
    maxAttempts: number = 10,
): Promise<string> {
    if (maxAttempts <= 0) {
        throw new Error('maxAttempts must be positive');
    }
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        const candidate = generateShortCode();
        // eslint-disable-next-line no-await-in-loop
        const taken = await exists(candidate);
        if (!taken) {
            return candidate;
        }
    }
    throw new Error(
        `Failed to generate a unique short code after ${maxAttempts} attempts`,
    );
}

/** True iff `code` matches the canonical 5-char alphabet and length. */
export function isValidShortCode(code: string): boolean {
    return SHORT_CODE_REGEX.test(code);
}

/** Uppercase + trim. Does not validate. */
export function normalizeShortCode(code: string): string {
    return code.trim().toUpperCase();
}
