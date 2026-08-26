import { resolveInitDate } from '@goalxi/database';
import { LOGGER_SERVICE, PinoLoggerService } from '@goalxi/logger';
import {
  ClassSerializerInterceptor,
  HttpStatus,
  RequestMethod,
  UnprocessableEntityException,
  ValidationError,
  ValidationPipe,
  VersioningType,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory, Reflector } from '@nestjs/core';
import { DataSource } from 'typeorm';
import compression from 'compression';
import helmet from 'helmet';
import { AuthService } from './api/auth/auth.service';
import { AppModule } from './app.module';
import { type AllConfigType } from './config/config.type';
import { GlobalExceptionFilter } from './filters/global-exception.filter';
import { AuthGuard } from './guards/auth.guard';
import { HealthStateService } from './health/health-state.service';
import { ReadinessGuard } from './health/readiness.guard';
import setupSwagger from './utils/setup-swagger';

async function bootstrap() {
  // `MODULES_SET` controls which slice of the app boots — see
  // `api/src/utils/modules-set.ts`. We echo it BEFORE Nest
  // constructs the AppModule so a misconfigured deploy (defaulting
  // to `monolith` when the operator meant `api`) is immediately
  // visible in the logs, rather than discovered hours later as
  // duplicated cron runs and double-writes.
  const modulesSet = process.env.MODULES_SET || 'monolith';

  console.warn(`[Bootstrap] MODULES_SET=${modulesSet}`);

  // Resolve the season/week anchor at boot. The order of
  // precedence is: `system_config.init_date` (written by the
  // `pnpm init:run` script) > `GAME_START_DATE` env var >
  // today (UTC midnight, dev-only fallback). Reading the DB
  // row is the right behaviour post-init: the env var only
  // matters on a fresh DB where the row doesn't exist yet
  // (i.e. first boot before the first init). After that, the
  // row is the source of truth and a misconfigured env var
  // is silently ignored. `resolveInitDate(manager, envValue)`
  // is the canonical helper.
  //
  // The actual `dataSource` isn't available until AFTER
  // `NestFactory.create` (TypeOrmModule wires it inside
  // AppModule), so the resolution happens post-bootstrap.
  // The pre-Nest `console.warn` below keeps the same
  // "GAME_START_DATE is unset" message visible at boot
  // even before the Nest app finishes wiring — useful for
  // dev where the env is typically unset.
  const envValue = process.env.GAME_START_DATE;
  if (!envValue || envValue.trim().length === 0) {
    console.warn(
      `[Bootstrap] GAME_START_DATE is unset. Will read init_date from system_config after Nest boots; ` +
        `falls back to today (UTC midnight) only if the row is also missing.`,
    );
  } else {
    console.warn(
      `[Bootstrap] GAME_START_DATE=${envValue} (env override; ` +
        `system_config.init_date takes precedence when both are set)`,
    );
  }

  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
  });

  // Pull the shared pino logger out of the DI container (registered by
  // `@goalxi/logger`'s global `LoggerModule.forRoot()` in modules-set.ts)
  // and wire it into Nest's static logger so bootstrap and runtime
  // messages share one transport.
  const logger = app.get<PinoLoggerService>(LOGGER_SERVICE);
  app.useLogger(logger);
  logger.warn(`[Bootstrap] MODULES_SET=${modulesSet}`);

  // Now that the TypeOrmModule has wired the DataSource, read
  // the real init_date from `system_config`. The DB row is
  // written by `pnpm init:run` and is the source of truth
  // post-init; the env var is only a fallback for fresh DBs.
  // `resolveInitDate(manager, envValue)` returns: the DB row
  // if it exists, else the env value if parseable, else
  // today (UTC midnight).
  const dataSource = app.get(DataSource);
  const initDateFromDb = await resolveInitDate(
    dataSource.manager,
    process.env.GAME_START_DATE,
  );
  logger.warn(
    `[Bootstrap] gameStart=${initDateFromDb.toISOString()} (source=${
      process.env.GAME_START_DATE ? 'env or system_config.init_date' : 'system_config.init_date or today'
    })`,
  );

  // Setup security headers
  app.use(helmet());

  // For high-traffic websites in production, it is strongly recommended to offload compression from the application server - typically in a reverse proxy (e.g., Nginx). In that case, you should not use compression middleware.
  app.use(compression());

  const configService = app.get(ConfigService<AllConfigType>);
  const reflector = app.get(Reflector);
  const corsOrigin = configService.getOrThrow('app.corsOrigin', {
    infer: true,
  });

  app.enableCors({
    origin: corsOrigin, // 确保这里的 corsOrigin 是一个数组（见下文）
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS', // 建议加上 OPTIONS
    allowedHeaders: 'Content-Type, Accept, Authorization', // 加上 Authorization
    credentials: true,
  });
  logger.warn(`CORS Origin: ${corsOrigin}`);

  // Use global prefix if you don't have subdomain
  app.setGlobalPrefix(
    configService.getOrThrow('app.apiPrefix', { infer: true }),
    {
      exclude: [
        { method: RequestMethod.GET, path: '/' },
        { method: RequestMethod.GET, path: 'health' },
      ],
    },
  );

  app.enableVersioning({
    type: VersioningType.URI,
  });

  // Order matters: ReadinessGuard runs first so a DB outage short-circuits
  // with 503 before AuthGuard tries to query the session table and queues
  // every request behind the connection-pool timeout.
  app.useGlobalGuards(
    new ReadinessGuard(app.get(HealthStateService), reflector),
    new AuthGuard(reflector, app.get(AuthService)),
  );
  app.useGlobalFilters(new GlobalExceptionFilter(configService));
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      errorHttpStatusCode: HttpStatus.UNPROCESSABLE_ENTITY,
      exceptionFactory: (errors: ValidationError[]) => {
        return new UnprocessableEntityException(errors);
      },
    }),
  );
  app.useGlobalInterceptors(new ClassSerializerInterceptor(reflector));

  if ((process.env.NODE_ENV || 'development') === 'development') {
    setupSwagger(app);
  }

  await app.listen(configService.getOrThrow('app.port', { infer: true }));

  logger.info(`Server running on ${await app.getUrl()}`);

  return app;
}
void bootstrap();
