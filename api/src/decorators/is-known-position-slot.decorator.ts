import { positionFamilyOf } from '@goalxi/database';
import {
  registerDecorator,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';

/**
 * Accepts any position slot the engine can place a player in — the 24
 * canonical pitch keys (GK, CBL, CB, CBR, LB, RB, LWB, RWB, DML, DM, DMR,
 * CML, CM, CMR, AML, AM, AMR, LM, RM, LW, RW, CFL, CF, CFR) plus the
 * legacy editor aliases the frontend and old `lineup_v2` rows still use
 * (CD, ST, CAM, DMFL, W1, …).
 *
 * Why a validator rather than an `@IsIn([...])` list: the alias table
 * lives in `@goalxi/database` next to `POSITION_FAMILIES`, and the
 * simulator folds slots through the exact same `positionFamilyOf`. A
 * hand-copied array here would drift the moment a slot is renamed, and
 * the failure mode is silent — the engine would treat an unknown slot as
 * "no position" and contribute nothing to any lane.
 *
 * Bench keys (BENCH_GK, BENCH_CB, …) are deliberately NOT accepted: a
 * position move changes where a player stands on the pitch, it cannot
 * park him on the bench.
 */
@ValidatorConstraint({ name: 'isKnownPositionSlot', async: false })
class IsKnownPositionSlotConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    if (value === undefined || value === null) return true;
    if (typeof value !== 'string') return false;
    return positionFamilyOf(value) !== null;
  }

  defaultMessage(): string {
    return 'position must be a known pitch slot (e.g. CB, CML, CAM, ST)';
  }
}

export function IsKnownPositionSlot(options?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isKnownPositionSlot',
      target: object.constructor,
      propertyName,
      options,
      validator: IsKnownPositionSlotConstraint,
    });
  };
}
