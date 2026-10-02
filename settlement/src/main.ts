import { NestFactory } from '@nestjs/core';
import { LOGGER_SERVICE, PinoLoggerService } from '@goalxi/logger';
import { AppModule } from './app.module';

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

  // Settlement is a worker, not a web service: it has no controllers
  // and serves no HTTP. `createApplicationContext` builds the DI
  // container and runs the full lifecycle (`onModuleInit` /
  // `onApplicationBootstrap`, which is where `ScheduleModule` mounts
  // its cron jobs and where `BootstrapService` runs the pyramid
  // generators) without ever binding a TCP port.
  //
  // It used to be `NestFactory.create(...)` + `app.listen(3001)`, which
  // reserved a port that served nothing — no routes, no health check,
  // no probe pointed at it. `simulator` already used
  // `createApplicationContext` for exactly this reason. The cost was
  // real: port collisions during local work, and an open port that
  // invites someone to point a liveness probe at a host that answers
  // nothing.
  //
  // One consequence: `app.useGlobalFilters(...)` is unavailable on an
  // application context, so the settlement-wide exception filter is no
  // longer registered here. That is not a loss of coverage — see
  // `common/global-exception.filter.ts`, which documents why it could
  // never have caught anything in this service anyway.
  const app = await NestFactory.createApplicationContext(AppModule, {
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

  logger.warn('Settlement service started');
}
bootstrap();
