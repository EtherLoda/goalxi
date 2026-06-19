import { EnumField, NumberField } from '@/decorators/field.decorators';
import { StadiumConstructionKind } from '@goalxi/database';

/**
 * §5 Stadium — Queue a new expand or demolish project.
 *
 * `kind` selects the speed model (expand is 5 000 seats/week, demolish is
 * 10 000 seats/week). `delta` is the absolute seat count and is always a
 * positive integer — the kind conveys the direction.
 */
export class StartConstructionReqDto {
  @EnumField(() => StadiumConstructionKind)
  kind!: StadiumConstructionKind;

  @NumberField({ min: 500, max: 100_000, int: true })
  delta!: number;
}
