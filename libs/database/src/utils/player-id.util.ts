/**
 * Strict player-id coercion.
 *
 * ## Why this exists
 *
 * `PlayerEntity.id` is a `number` (autoincrement int) after the
 * uuid→int migration. But several code paths still operate on
 * the stringified form — `generateAutoLineup` returns
 * `Record<string, string>`, jsonb `lineup_v2` columns can hold
 * either form during a migration in flight, and wire payloads
 * (HTTP, WS) carry numbers but may be deserialised as strings
 * by some clients.
 *
 * The historical conversion pattern was
 *
 *     const asNum = Number(id);
 *     ... Number.isFinite(asNum) ? asNum : 0
 *
 * which is silently wrong on two counts:
 *
 *   1. `Number("550e8400-e29b-41d4-a716-446655440000")` returns
 *      `NaN` (correct), so the `?? 0` fallback stamps a foreign
 *      (likely nonexistent) player id into the slot.
 *   2. `Number("123abc")` returns `123` (JS coercion, not strict
 *      parsing), so a non-pure-digit string would silently become
 *      a plausible-looking but wrong player id.
 *
 * The two functions below both use `/^\d+$/` to require a
 * pure-digit string. `parsePlayerId` is for **write** paths and
 * throws so a regression surfaces immediately; `tryParsePlayerId`
 * is for **read** paths over pre-migration jsonb and returns
 * `null` so a single bad row doesn't take down the pipeline.
 */

/**
 * Strict: requires a positive integer. Throws on any non-conforming
 * value (null, undefined, non-pure-digit string, float, non-positive
 * int, or a number outside `Number.isSafeInteger`).
 *
 * Use this in the init generator, the user-facing editor save path,
 * and anywhere else that is *producing* a `Record<string, number>`
 * lineup map. A bad id here is a programming error and should fail
 * loudly.
 */
export function parsePlayerId(id: string | number | null | undefined): number {
  if (id === null || id === undefined) {
    throw new TypeError(
      'parsePlayerId: id is null/undefined; expected a positive integer',
    );
  }
  if (typeof id === 'number') {
    if (!Number.isInteger(id) || id <= 0 || !Number.isSafeInteger(id)) {
      throw new TypeError(
        `parsePlayerId: id must be a positive safe integer, got ${id}`,
      );
    }
    return id;
  }
  // Strict regex: only digit characters. Catches UUIDs,
  // "123abc", " 123 ", "+123", "0x1f", "1.5", "" — every
  // shape `Number(id)` would either silently accept
  // ("123abc"→123) or silently turn into NaN that the
  // caller then maps to 0.
  if (typeof id !== 'string' || !/^\d+$/.test(id)) {
    throw new TypeError(
      `parsePlayerId: id must be a pure-digit string, got ${JSON.stringify(id)}. ` +
        'This is a data integrity regression — see PlayerEntity docstring ' +
        'for the uuid→int migration contract.',
    );
  }
  const n = parseInt(id, 10);
  if (!Number.isSafeInteger(n) || n <= 0) {
    throw new TypeError(
      `parsePlayerId: parsed id is not a positive safe integer, got ${n} from ${JSON.stringify(id)}`,
    );
  }
  return n;
}

/**
 * Lenient: returns `null` for any non-conforming value. Use this
 * over **read** paths (jsonb columns, wire payloads) where a
 * pre-migration row may carry a non-int id and the caller wants
 * to skip the bad slot rather than fail the whole computation.
 *
 * The same `/^\d+$/` guard is applied — silently accepting
 * `"123abc"` as 123 would mask the same class of bug this
 * utility is designed to catch; a bad id is still bad, the only
 * question is whether the caller wants to throw or skip.
 */
export function tryParsePlayerId(
  id: string | number | null | undefined,
): number | null {
  if (id === null || id === undefined) return null;
  if (typeof id === 'number') {
    return Number.isInteger(id) && id > 0 && Number.isSafeInteger(id)
      ? id
      : null;
  }
  if (typeof id !== 'string' || !/^\d+$/.test(id)) return null;
  const n = parseInt(id, 10);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}
