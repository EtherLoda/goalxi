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
 * - `date` is the *forecast target* (i.e. tomorrow of the queried date).
 * - `forecasts` contains 2-3 weighted options.
 * - `source` is either `'persisted'` (came from the weather table) or
 *   `'generated'` (we synthesised it from the base weights because no row
 *   existed yet). Useful for debugging and for the UI to label the
 *   confidence.
 */
export class WeatherForecastResDto {
  date!: string;
  locationId!: string;
  forecasts!: WeatherForecastEntryResDto[];
  source!: 'persisted' | 'generated';
}
