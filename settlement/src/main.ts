import { NestFactory } from '@nestjs/core';
import { LOGGER_SERVICE, PinoLoggerService } from '@goalxi/logger';
import { AppModule } from './app.module';
import { GlobalExceptionFilter } from './common/global-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
  });

  // Pull the shared pino logger from the DI container (registered by
  // `@goalxi/logger`'s global `LoggerModule.forRoot()` in app.module.ts).
  const logger = app.get<PinoLoggerService>(LOGGER_SERVICE);
  app.useLogger(logger);

  // Apply the settlement-wide exception filter so unhandled errors from
  // cron handlers and BullMQ workers land in pino-roll instead of
  // terminating the worker silently.
  app.useGlobalFilters(app.get(GlobalExceptionFilter));

  logger.warn('Settlement service started');
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();