import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

/**
 * Query string for `GET /v1/notifications`.
 *
 * The class defaults (page=1, limit=20) match the controller's
 * pre-validation behaviour, so even if the client omits both
 * fields we still produce a sensible page rather than NaN.
 */
export class ListNotificationsReqDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}
