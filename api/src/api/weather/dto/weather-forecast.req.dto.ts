import { IsOptional, IsString, Matches } from 'class-validator';

/**
 * Query DTO for the public weather-forecast endpoint.
 *
 * Either `date` (YYYY-MM-DD) or `stadiumId` (uuid) is accepted. The frontend
 * prefers `date` because we generate forecasts per day and one location for
 * now (`'default'`); `stadiumId` is reserved for future per-stadium logic.
 */
export class WeatherForecastReqDto {
  /** Target date in YYYY-MM-DD format. */
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'date must be in YYYY-MM-DD format',
  })
  date?: string;

  /** Stadium UUID. Reserved for per-stadium forecasts. */
  @IsOptional()
  @IsString()
  stadiumId?: string;

  /**
   * Logical location bucket. Defaults to `'default'` (single-shared forecast)
   * to match the existing settlement service. Per-city buckets can be added
   * later without breaking the public API.
   */
  @IsOptional()
  @IsString()
  locationId?: string;
}
