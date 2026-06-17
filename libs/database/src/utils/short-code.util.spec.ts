import {
  generateShortCode,
  generateUniqueShortCode,
  isValidShortCode,
  normalizeShortCode,
  SHORT_CODE_ALPHABET,
  SHORT_CODE_LENGTH,
} from './short-code.util';

describe('short-code.util', () => {
    describe('generateShortCode', () => {
        it('returns a string of the default length', () => {
            const code = generateShortCode();
            expect(code).toHaveLength(SHORT_CODE_LENGTH);
        });

        it('returns a string of the requested length', () => {
            expect(generateShortCode(3)).toHaveLength(3);
            expect(generateShortCode(8)).toHaveLength(8);
        });

        it('uses only characters from the alphabet', () => {
            for (let i = 0; i < 200; i++) {
                const code = generateShortCode();
                for (const ch of code) {
                    expect(SHORT_CODE_ALPHABET).toContain(ch);
                }
            }
        });

        it('rejects non-positive length', () => {
            expect(() => generateShortCode(0)).toThrow();
            expect(() => generateShortCode(-1)).toThrow();
        });
    });

    describe('isValidShortCode', () => {
        it('accepts a freshly generated code', () => {
            expect(isValidShortCode(generateShortCode())).toBe(true);
        });

        it('accepts lowercase input (case-insensitive)', () => {
            expect(isValidShortCode('abcde')).toBe(true);
        });

        it.each([
            ['empty string', ''],
            ['too short', 'ABCD'],
            ['too long', 'ABCDEF'],
            ['contains zero', 'AB0DE'],
            ['contains one', 'AB1DE'],
            ['contains I', 'ABIDE'],
            ['contains L', 'ABLDE'],
            ['contains O', 'ABODE'],
            ['contains hyphen', 'AB-DE'],
            ['contains space', 'AB DE'],
            ['non-string', null as unknown as string],
            ['undefined', undefined as unknown as string],
        ])('rejects %s', (_label, input) => {
            expect(isValidShortCode(input as string)).toBe(false);
        });
    });

    describe('normalizeShortCode', () => {
        it('uppercases and trims', () => {
            expect(normalizeShortCode('abcde')).toBe('ABCDE');
            expect(normalizeShortCode('  ab23x  ')).toBe('AB23X');
        });
    });

    describe('generateUniqueShortCode', () => {
        it('returns a code on first try when exists() is false', async () => {
            const code = await generateUniqueShortCode(async () => false);
            expect(isValidShortCode(code)).toBe(true);
        });

        it('retries while codes are taken, then returns a free one', async () => {
            let calls = 0;
            const taken: string[] = [];
            const code = await generateUniqueShortCode(async (c) => {
                calls += 1;
                // First two attempts report "taken", third is free
                if (calls <= 2) {
                    taken.push(c);
                    return true;
                }
                return false;
            });
            expect(calls).toBe(3);
            expect(taken).toHaveLength(2);
            expect(isValidShortCode(code)).toBe(true);
            expect(taken).not.toContain(code);
        });

        it('throws when every attempt is taken', async () => {
            await expect(
                generateUniqueShortCode(async () => true, 5),
            ).rejects.toThrow(/Failed to generate a unique short code/);
        });

        it('rejects non-positive maxAttempts', async () => {
            await expect(
                generateUniqueShortCode(async () => false, 0),
            ).rejects.toThrow();
        });
    });
});
