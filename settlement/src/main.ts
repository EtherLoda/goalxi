import { resolveGameStart } from '@goalxi/database';
import { NestFactory } from '@nestjs/core';
import { LOGGER_SERVICE, PinoLoggerService } from '@goalxi/logger';
import { AppModule } from './app.module';
import { GlobalExceptionFilter } from './common/global-exception.filter';

async function bootstrap() {
  // Resolve the season/week anchor at boot and log it. Every
  // service that needs a season/week reads the same env via
  // `resolveGameStart`; surfacing the resolved value once here
  // makes drift between the env value and the actual fallback
  // obvious in the boot logs.
  const envValue = process.env.GAME_START_DATE;
  const gameStart = resolveGameStart(envValue);
  if (envValue && envValue.trim().length > 0) {
    const parsed = new Date(envValue);
    if (isNaN(parsed.getTime())) {
      console.error(
        `[Bootstrap] GAME_START_DATE='${envValue}' is not a parseable date. ` +
          `Falling back to today (UTC midnight). Fix the env var so season/week are stable across restarts.`,
      );
    } else {
      console.warn(
        `[Bootstrap] GAME_START_DATE=${envValue} -> ${gameStart.toISOString()}`,
      );
    }
  } else {
    console.warn(
      `[Bootstrap] GAME_START_DATE is unset. Falling back to today (UTC midnight = ${gameStart.toISOString()}). ` +
        `Production MUST set GAME_START_DATE=YYYY-MM-DD so a restart does not reset the season.`,
    );
  }

  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
  });

  // Pull the shared pino logger from the DI container (registered by
  // `@goalxi/logger`'s global `LoggerModule.forRoot()` in app.module.ts).
  const logger = app.get<PinoLoggerService>(LOGGER_SERVICE);
  app.useLogger(logger);
  logger.warn(
    `[Bootstrap] gameStart=${gameStart.toISOString()} (GAME_START_DATE=${envValue ?? '<unset>'})`,
  );

  // Apply the settlement-wide exception filter so unhandled errors from
  // cron handlers and BullMQ workers land in pino-roll instead of
  // terminating the worker silently.
  app.useGlobalFilters(app.get(GlobalExceptionFilter));

  logger.warn('Settlement service started');
  await app.listen(process.env.PORT ?? 3001);
}
bootstrap();
