import { NestFactory } from '@nestjs/core';
import { LOGGER_SERVICE, PinoLoggerService } from '@goalxi/logger';
import { AppModule } from './app.module';
import { GlobalExceptionFilter } from './common/global-exception.filter';

async function bootstrap() {
  // Resolve the season/week anchor at boot and log it.
  //
  // NOTE: this is a *preview* of the env fallback only. The
  // authoritative anchor is `system_config.init_date`, which
  // `BootstrapService` reads via `resolveInitDate` once Nest is up —
  // and `resolveInitDate` returns that row in preference to the env
  // var. So on an initialised database the value printed below is
  // ignored, and logging it as "the" game start is what produced two
  // contradictory dates in the boot log.
  //
  // `GAME_START_DATE` is not set in any checked-in env file for that
  // reason; it remains supported by `resolveGameStart` only as the
  // pre-init fallback for a fresh database.
  const envValue = process.env.GAME_START_DATE;
  if (!envValue || envValue.trim().length === 0) {
    console.warn(
      `[Bootstrap] GAME_START_DATE is unset. ` +
        `The season/week anchor will be read from system_config (init_date) once Nest boots; ` +
        `the env var is only a fallback for a database that has not run init:run yet.`,
    );
  } else if (isNaN(new Date(envValue).getTime())) {
    console.warn(
      `[Bootstrap] GAME_START_DATE='${envValue}' is not a parseable date. ` +
        `It will be ignored in favour of system_config.init_date.`,
    );
  } else {
    console.warn(
      `[Bootstrap] GAME_START_DATE=${envValue} is set, but system_config.init_date ` +
        `takes precedence — expect the effective anchor to differ.`,
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
    `[Bootstrap] settlement starting (GAME_START_DATE=${
      envValue ?? '<unset>'
    }; effective anchor is read from system_config by BootstrapService)`,
  );

  // Apply the settlement-wide exception filter so unhandled errors from
  // cron handlers and BullMQ workers land in pino-roll instead of
  // terminating the worker silently.
  app.useGlobalFilters(app.get(GlobalExceptionFilter));

  logger.warn('Settlement service started');
  await app.listen(process.env.PORT ?? 3001);
}
bootstrap();
