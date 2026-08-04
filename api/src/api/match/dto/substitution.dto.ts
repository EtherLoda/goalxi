import { IsInt, Max, Min } from 'class-validator';

/**
 * After the PlayerIdToNumeric migration, `Player.id` is an int, not a uuid.
 * The legacy `@IsUUID()` here broke every submit that included a substitution
 * (DTO validation rejected `out`/`in` as non-UUID, returning 422 even for a
 * perfectly valid request). Use `@IsInt()` and match `MatchTacticsEntity`'s
 * `substitutionsV2` shape (int player ids).
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
}
