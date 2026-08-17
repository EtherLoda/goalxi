import {
  registerDecorator,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';

/**
 * Runtime IANA-timezone validator. We can't enumerate valid zones
 * (the tz database has 400+ entries and grows), so we use the
 * platform's own `Intl.DateTimeFormat` as the oracle — the same
 * one the FE will use to format dates.
 *
 * Why this is safe:
 *   - The browser/Node global `Intl.DateTimeFormat` throws on an
 *     unknown zone. We catch the throw and report `false`, so
 *     `class-validator` rejects the request.
 *   - The format the FE reads back is the exact same string the
 *     user picked, so there's no risk of an accepted-but-throws-
 *     later round trip.
 */
@ValidatorConstraint({ name: 'isValidTimezone', async: false })
class IsValidTimezoneConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    if (typeof value !== 'string' || value.length === 0) return false;
    if (value.length > 64) return false;
    try {
      // Throws RangeError if `value` is not a known IANA zone.
      new Intl.DateTimeFormat('en-US', { timeZone: value });
      return true;
    } catch {
      return false;
    }
  }

  defaultMessage(): string {
    return 'timezone must be a valid IANA timezone string (e.g. Asia/Shanghai)';
  }
}

export function IsValidTimezone(options?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isValidTimezone',
      target: object.constructor,
      propertyName,
      options,
      validator: IsValidTimezoneConstraint,
    });
  };
}
