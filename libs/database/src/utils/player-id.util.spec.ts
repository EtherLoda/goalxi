import { parsePlayerId, tryParsePlayerId } from './player-id.util';

/**
 * Spec for the strict / lenient player-id coercion helpers.
 *
 * The bug we're guarding against is the lenient
 * `Number(id) + Number.isFinite + ?? 0` pattern that used to
 * live in `tactics-preset.generator.ts`:
 *
 *   - `Number("550e8400-…")` → NaN → fallback stamps 0 into
 *     a lineup slot, pointing the engine at a foreign player.
 *   - `Number("123abc")` → 123 (silent JS coercion), so a
 *     stray non-digit suffix gets accepted as a plausible id.
 *
 * The cases below pin both the happy path (pure-digit string,
 * int) and every shape the old pattern used to mishandle.
 */
describe('parsePlayerId (strict, write path)', () => {
  describe('happy path', () => {
    it('accepts a positive integer number', () => {
      expect(parsePlayerId(42)).toBe(42);
      expect(parsePlayerId(1)).toBe(1);
    });

    it('accepts a pure-digit string', () => {
      expect(parsePlayerId('42')).toBe(42);
      expect(parsePlayerId('1')).toBe(1);
      // Big but still safe.
      expect(parsePlayerId(String(Number.MAX_SAFE_INTEGER))).toBe(
        Number.MAX_SAFE_INTEGER,
      );
    });
  });

  describe('rejects the legacy UUID shape', () => {
    it('throws on a legacy uuid string (the original bug)', () => {
      // This is the exact shape PlayerEntity.id had pre-migration.
      expect(() => parsePlayerId('550e8400-e29b-41d4-a716-446655440000')).toThrow(
        /pure-digit string/,
      );
    });
  });

  describe('rejects the Number() silent-accept shapes', () => {
    it('throws on "123abc" (Number() would silently return 123)', () => {
      // This is the second class of bug the old pattern hid.
      expect(() => parsePlayerId('123abc')).toThrow(/pure-digit string/);
    });

    it('throws on " 123 " (whitespace-padded)', () => {
      expect(() => parsePlayerId(' 123 ')).toThrow(/pure-digit string/);
    });

    it('throws on "+123" (signed)', () => {
      expect(() => parsePlayerId('+123')).toThrow(/pure-digit string/);
    });

    it('throws on "0x1f" (hex)', () => {
      expect(() => parsePlayerId('0x1f')).toThrow(/pure-digit string/);
    });

    it('throws on "1.5" (float-shaped string)', () => {
      expect(() => parsePlayerId('1.5')).toThrow(/pure-digit string/);
    });

    it('throws on an empty string', () => {
      expect(() => parsePlayerId('')).toThrow(/pure-digit string/);
    });
  });

  describe('rejects null / undefined', () => {
    it('throws on null', () => {
      expect(() => parsePlayerId(null)).toThrow(/null\/undefined/);
    });

    it('throws on undefined', () => {
      expect(() => parsePlayerId(undefined)).toThrow(/null\/undefined/);
    });
  });

  describe('rejects invalid numbers', () => {
    it('throws on 0 (player ids are 1-indexed)', () => {
      expect(() => parsePlayerId(0)).toThrow(/positive safe integer/);
    });

    it('throws on negative ints', () => {
      expect(() => parsePlayerId(-1)).toThrow(/positive safe integer/);
    });

    it('throws on floats', () => {
      expect(() => parsePlayerId(1.5)).toThrow(/positive safe integer/);
    });

    it('throws on NaN / Infinity', () => {
      expect(() => parsePlayerId(NaN)).toThrow(/positive safe integer/);
      expect(() => parsePlayerId(Infinity)).toThrow(/positive safe integer/);
    });
  });
});

describe('tryParsePlayerId (lenient, read path)', () => {
  describe('happy path', () => {
    it('returns the int for a positive integer number', () => {
      expect(tryParsePlayerId(42)).toBe(42);
    });

    it('returns the parsed int for a pure-digit string', () => {
      expect(tryParsePlayerId('42')).toBe(42);
    });
  });

  describe('returns null for the legacy UUID shape (no throw)', () => {
    it('skips a legacy uuid without throwing', () => {
      // The read path is allowed to see pre-migration jsonb;
      // a uuid entry should be skipped, not crash the pipeline.
      expect(
        tryParsePlayerId('550e8400-e29b-41d4-a716-446655440000'),
      ).toBeNull();
    });
  });

  describe('returns null for the Number() silent-accept shapes', () => {
    it('returns null on "123abc" (no silent accept of 123)', () => {
      expect(tryParsePlayerId('123abc')).toBeNull();
    });

    it('returns null on " 123 "', () => {
      expect(tryParsePlayerId(' 123 ')).toBeNull();
    });

    it('returns null on empty string', () => {
      expect(tryParsePlayerId('')).toBeNull();
    });

    it('returns null on "0" (player ids are 1-indexed)', () => {
      expect(tryParsePlayerId('0')).toBeNull();
      expect(tryParsePlayerId(0)).toBeNull();
    });
  });

  describe('returns null for null / undefined', () => {
    it('returns null on null', () => {
      expect(tryParsePlayerId(null)).toBeNull();
    });

    it('returns null on undefined', () => {
      expect(tryParsePlayerId(undefined)).toBeNull();
    });
  });

  /**
   * Behavioural demo: filtering a jsonb map through
   * `tryParsePlayerId` should drop every non-pure-digit
   * entry, including the `"123abc"` shape that the old
   * `Number() + isFinite` would have silently accepted as
   * 123. This is the read-path equivalent of the write-path
   * tripwire in `tactics-preset.generator.spec.ts`.
   */
  it('drops bad rows from a jsonb-style map', () => {
    const jsonb: Record<string, unknown> = {
      GK: 1,
      LB: '2',
      CB: '550e8400-e29b-41d4-a716-446655440000', // legacy uuid
      RB: '123abc', // silent-accept shape
      DM: '0', // invalid
      CM: null,
      // Whitespace-padded numeric string — also bad.
      LM: ' 4 ',
      RM: 0, // invalid
      ST: 5,
    };
    const ids = Object.values(jsonb)
      .map((v) => tryParsePlayerId(v as any))
      .filter((v): v is number => v !== null);
    // Only the three genuinely good entries (GK=1, LB=2, ST=5)
    // survive; the legacy uuid, the silent-accept shape, the
    // zero, the null, the whitespace-padded string, and the
    // zero number are all dropped.
    expect(ids.sort((a, b) => a - b)).toEqual([1, 2, 5]);
  });
});
