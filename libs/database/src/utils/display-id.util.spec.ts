import {
  DISPLAY_ID_LENGTH,
  DISPLAY_ID_MAX,
  displayIdFromUuid,
  formatDisplayId,
  generateUniqueDisplayId,
  isValidDisplayId,
  parseDisplayId,
} from './display-id.util';

describe('display-id.util', () => {
    describe('displayIdFromUuid', () => {
        it('is deterministic for the same uuid', () => {
            const uuid = '550e8400-e29b-41d4-a716-446655440000';
            const a = displayIdFromUuid(uuid);
            const b = displayIdFromUuid(uuid);
            expect(a).toBe(b);
        });

        it('produces values inside [0, 10^11)', () => {
            const samples = [
                '550e8400-e29b-41d4-a716-446655440000',
                '00000000-0000-0000-0000-000000000000',
                'ffffffff-ffff-ffff-ffff-ffffffffffff',
                '12345678-1234-1234-1234-123456789012',
            ];
            for (const uuid of samples) {
                const id = displayIdFromUuid(uuid);
                expect(id).toBeGreaterThanOrEqual(0n);
                expect(id).toBeLessThan(DISPLAY_ID_MAX);
            }
        });

        it('produces different values for different uuids', () => {
            const a = displayIdFromUuid('550e8400-e29b-41d4-a716-446655440000');
            const b = displayIdFromUuid('550e8400-e29b-41d4-a716-446655440001');
            expect(a).not.toBe(b);
        });
    });

    describe('formatDisplayId', () => {
        it('zero-pads to 11 characters', () => {
            expect(formatDisplayId(0n)).toBe('00000000000');
            expect(formatDisplayId(42n)).toBe('00000000042');
            expect(formatDisplayId(12345678901n)).toBe('12345678901');
        });

        it('produces a string of DISPLAY_ID_LENGTH characters', () => {
            const id = displayIdFromUuid('550e8400-e29b-41d4-a716-446655440000');
            expect(formatDisplayId(id)).toHaveLength(DISPLAY_ID_LENGTH);
        });
    });

    describe('isValidDisplayId', () => {
        it('accepts 11-digit numeric strings', () => {
            expect(isValidDisplayId('00000000000')).toBe(true);
            expect(isValidDisplayId('12345678901')).toBe(true);
        });

        it.each([
            ['empty string', ''],
            ['10 digits', '1234567890'],
            ['12 digits', '123456789012'],
            ['contains letter', '1234567890a'],
            ['contains space', '1234567890 '],
            ['contains hyphen', '1234567890-'],
            ['leading minus', '-1234567890'],
            ['non-string', null as unknown as string],
            ['undefined', undefined as unknown as string],
        ])('rejects %s', (_label, input) => {
            expect(isValidDisplayId(input as string)).toBe(false);
        });
    });

    describe('parseDisplayId', () => {
        it('parses valid strings to bigint', () => {
            expect(parseDisplayId('00000000000')).toBe(0n);
            expect(parseDisplayId('12345678901')).toBe(12345678901n);
        });

        it('returns null for invalid input', () => {
            expect(parseDisplayId('')).toBeNull();
            expect(parseDisplayId('12345')).toBeNull();
            expect(parseDisplayId('abc')).toBeNull();
        });
    });

    describe('generateUniqueDisplayId', () => {
        it('returns a free candidate on the first try', async () => {
            const id = await generateUniqueDisplayId(
                '550e8400-e29b-41d4-a716-446655440000',
                async () => false,
            );
            expect(formatDisplayId(id)).toMatch(/^\d{11}$/);
        });

        it('retries through taken candidates then returns a free one', async () => {
            const seen: bigint[] = [];
            const id = await generateUniqueDisplayId(
                '550e8400-e29b-41d4-a716-446655440000',
                async (c) => {
                    if (seen.length < 2) {
                        seen.push(c);
                        return true;
                    }
                    return false;
                },
            );
            expect(seen).toHaveLength(2);
            expect(seen).not.toContain(id);
        });

        it('throws when every attempt is taken', async () => {
            await expect(
                generateUniqueDisplayId(
                    '550e8400-e29b-41d4-a716-446655440000',
                    async () => true,
                    5,
                ),
            ).rejects.toThrow(/Failed to generate a unique display ID/);
        });

        it('rejects non-positive maxAttempts', async () => {
            await expect(
                generateUniqueDisplayId(
                    '550e8400-e29b-41d4-a716-446655440000',
                    async () => false,
                    0,
                ),
            ).rejects.toThrow();
        });
    });
});
