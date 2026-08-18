import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

/**
 * Query string for `GET /cups`. Filters the cup list by
 * season and type. Both are optional — omitting both
 * returns every cup in the system (typically 1 per season).
 */
export class ListCupReqDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(99)
  season?: number;

  @IsOptional()
  type?: string;
}
