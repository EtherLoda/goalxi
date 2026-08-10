import { NestFactory } from '@nestjs/core';
import { LOGGER_SERVICE, PinoLoggerService } from '@goalxi/logger';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    bufferLogs: true,
  });

  // Pull the shared pino logger from the DI container (registered by
  // `@goalxi/logger`'s global `LoggerModule.forRoot()` in app.module.ts).
  const logger = app.get<PinoLoggerService>(LOGGER_SERVICE);
  app.useLogger(logger);

  // The global exception filter is registered as an `APP_FILTER` provider
  // in `AppModule` — `INestApplicationContext` (which we get from
  // `createApplicationContext`) doesn't expose `useGlobalFilters`,
  // so the provider-token route is the only option for a context-only
  // app. Any unhandled error from BullMQ workers, @Cron handlers, or
  // module init hooks lands in pino-roll with a stack — instead of
  // silently terminating the process. See
  // `simulator/src/common/global-exception.filter.ts`.

  logger.warn('Simulator service started');
}
bootstrap();
