/**
 * Loose UUID v4 validator (case-insensitive). Used to disambiguate incoming
 * path parameters that may carry either a UUID or a short code.
 */
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string | null | undefined): boolean {
  if (typeof value !== 'string') return false;
  return UUID_REGEX.test(value);
}
