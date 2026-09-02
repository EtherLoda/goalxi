import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';
import { EventCondition } from '../types/tactical-dimensions';

/**
 * After the PlayerIdToNumeric migration, `Player.id` is an int, not a uuid.
 * The legacy `@IsUUID()` here broke every submit that included a substitution
 * (DTO validation rejected `out`/`in` as non-UUID, returning 422 even for a
 * perfectly valid request). Use `@IsInt()` and match `MatchTacticsEntity`'s
 * `substitutionsV2` shape (int player ids).
 *
 * `condition` is optional — when omitted, the engine treats it as `always`
 * (see `MatchEngine.shouldFire` in `simulator/src/engine/match.engine.ts`).
 * Without this field the global `ValidationPipe` with `whitelist: true` would
 * silently strip it from the wire payload and the engine would always fire
 * the sub regardless of the score.
 */
export class SubstitutionDto {
  @IsInt()
  @Min(1)
  @Max(90)
  minute!: number;

  @IsInt()
  out!: number;

  @IsInt()
  in!: number;

  @IsEnum(EventCondition)
  @IsOptional()
  condition?: EventCondition;
}
