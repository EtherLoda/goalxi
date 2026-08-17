import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDefined,
  IsInt,
  IsOptional,
  IsPositive,
  ValidateNested,
} from 'class-validator';

/**
 * PATCH body for `PATCH /teams/:id/bench-config`.
 *
 * Replaces the previous raw `any` body, which let any authenticated
 * caller dump arbitrary JSON into `team.bench_config` (e.g.
 * `{"centerBack": 99999999}`). The DTO now enforces:
 *
 *   1. Body must be `{ benchConfig: { ... } }` — the nested shape
 *      matches the FE client (`api.ts:updateBenchConfig`) and the
 *      entity's `BenchConfig` interface, so no FE change is required.
 *   2. Each of the 6 substitution slots is `number | null` —
 *      a positive integer playerId, or `null` to leave the slot
 *      empty. Strings, floats, negatives, NaN are all rejected at
 *      the ValidationPipe layer (422 with a per-field error). The
 *      global pipe runs with `transform: true` so `"123"` from a
 *      query string is coerced into `123` and then passes `@IsInt`.
 *
 * What this DTO does NOT enforce (lives in `TeamService`):
 *
 *   - playerId ∈ teamId squad (the substitute must actually belong
 *     to the team). This is a DB lookup, not a sync check, so it
 *     belongs in the service layer.
 *   - `goalkeeper` slot must reference a player with `isGoalkeeper = true`.
 *     This is the one product rule from the user: a player can play
 *     any outfield position, but a goalkeeper slot can only be filled
 *     by an actual goalkeeper. The other 5 slots are unconstrained
 *     (the user's brief: "球员随意踢任何位置 除了 GK").
 *
 * Why nested instead of flattened at the wire: the FE already sends
 * `{ benchConfig: { goalkeeper: 123, ... } }` and the engine already
 * reads `benchConfig[benchKey]`, so a flat wire shape would force a
 * change on the FE plus a breaking change on the persisted JSON.
 * Keeping the wrapper is free, and the DTO still adds the missing
 * type safety.
 */
export class BenchConfigBodyDto {
  @ApiProperty({ type: Number, nullable: true, required: false })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  goalkeeper?: number | null;

  @ApiProperty({ type: Number, nullable: true, required: false })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  centerBack?: number | null;

  @ApiProperty({ type: Number, nullable: true, required: false })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  fullback?: number | null;

  @ApiProperty({ type: Number, nullable: true, required: false })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  winger?: number | null;

  @ApiProperty({ type: Number, nullable: true, required: false })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  centralMidfield?: number | null;

  @ApiProperty({ type: Number, nullable: true, required: false })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  forward?: number | null;
}

export class UpdateBenchConfigReqDto {
  @ApiProperty({ type: BenchConfigBodyDto, required: true })
  @IsDefined()
  @Type(() => BenchConfigBodyDto)
  @ValidateNested()
  benchConfig: BenchConfigBodyDto;
}
