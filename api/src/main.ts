import { LOGGER_SERVICE, PinoLoggerService } from '@goalxi/logger';
import { resolveGameStart } from '@goalxi/database';
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
import compression from 'compression';
import helmet from 'helmet';
import { AuthService } from './api/auth/auth.service';
import { AppModule } from './app.module';
import { type AllConfigType } from './config/config.type';
import { GlobalExceptionFilter } from './filters/global-exception.filter';
import { AuthGuard } from './guards/auth.guard';
import setupSwagger from './utils/setup-swagger';

async function bootstrap() {
  // `MODULES_SET` controls which slice of the app boots — see
  // `api/src/utils/modules-set.ts`. We echo it BEFORE Nest
  // constructs the AppModule so a misconfigured deploy (defaulting
  // to `monolith` when the operator meant `api`) is immediately
  // visible in the logs, rather than discovered hours later as
  // duplicated cron runs and double-writes.
  const modulesSet = process.env.MODULES_SET || 'monolith';
  // eslint-disable-next-line no-console
  console.warn(`[Bootstrap] MODULES_SET=${modulesSet}`);

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
      // eslint-disable-next-line no-console
      console.error(
        `[Bootstrap] GAME_START_DATE='${envValue}' is not a parseable date. ` +
          `Falling back to today (UTC midnight). Fix the env var so season/week are stable across restarts.`,
      );
    } else {
      // eslint-disable-next-line no-console
      console.warn(
        `[Bootstrap] GAME_START_DATE=${envValue} -> ${gameStart.toISOString()}`,
      );
    }
  } else {
    // eslint-disable-next-line no-console
    console.warn(
      `[Bootstrap] GAME_START_DATE is unset. Falling back to today (UTC midnight = ${gameStart.toISOString()}). ` +
        `Production MUST set GAME_START_DATE=YYYY-MM-DD so a restart does not reset the season.`,
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
  logger.warn(
    `[Bootstrap] gameStart=${gameStart.toISOString()} (GAME_START_DATE=${envValue ?? '<unset>'})`,
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

  app.useGlobalGuards(new AuthGuard(reflector, app.get(AuthService)));
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
