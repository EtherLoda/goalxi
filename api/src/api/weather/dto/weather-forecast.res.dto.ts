import { WeatherType } from '@goalxi/database';

/**
 * A single forecast option for tomorrow's weather. `probability` is 0–100
 * and the array always sums to 100.
 */
export class WeatherForecastEntryResDto {
  weather!: WeatherType;
  probability!: number;
}

/**
 * Public response shape for `GET /weather/forecast`.
 *
 * - `date` is the *forecast target* (the day the caller asked about).
 * - `forecasts` contains 2-3 weighted options, or is empty when the
 *   target date is outside the forecast window.
 * - `source` discriminates how the data was produced:
 *     - `'persisted'`   — came from the `weather` table.
 *     - `'generated'`   — synthesised from base weights (no row found).
 *     - `'out_of_range'`— target is too far ahead; `forecasts` is empty.
 */
export class WeatherForecastResDto {
  date!: string;
  locationId!: string;
  forecasts!: WeatherForecastEntryResDto[];
  source!: 'persisted' | 'generated' | 'out_of_range';
}
