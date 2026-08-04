import { Controller, Get, Query } from '@nestjs/common';
import { Public } from '@/decorators/public.decorator';
import { WeatherForecastReqDto } from './dto/weather-forecast.req.dto';
import { WeatherForecastResDto } from './dto/weather-forecast.res.dto';
import { WeatherService } from './weather.service';

@Controller({
  path: 'weather',
  version: '1',
})
export class WeatherController {
  constructor(private readonly weatherService: WeatherService) {}

  /**
   * Public weather-forecast endpoint. The frontend calls this for the
   * pre-match view to render the predicted weather on the right info card.
   *
   * - `date` (YYYY-MM-DD): required unless `stadiumId` is provided.
   *   Today + 1 day is the default if omitted.
   * - `locationId`: optional logical bucket (defaults to `'default'`).
   */
  @Public()
  @Get('forecast')
  async getForecast(
    @Query() query: WeatherForecastReqDto,
  ): Promise<WeatherForecastResDto> {
    const date = query.date ?? this.formatDate(new Date());
    const locationId = query.locationId ?? 'default';
    return this.weatherService.getForecast(date, locationId);
  }

  private formatDate(d: Date): string {
    return d.toISOString().slice(0, 10);
  }
}
