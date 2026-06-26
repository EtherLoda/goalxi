import {
  type DynamicModule,
  Global,
  type Provider,
  Module,
} from '@nestjs/common';
import { PinoLoggerService } from './pino-logger.service';
import type { PinoLoggerOptions } from './logger.types';

/**
 * DI token used to inject the shared `PinoLoggerService` instance.
 *
 * Example:
 * ```ts
 * constructor(@Inject(LOGGER_SERVICE) private readonly logger: PinoLoggerService) {}
 * ```
 */
export const LOGGER_SERVICE = Symbol('LOGGER_SERVICE');

/**
 * Internal provider token for the raw options object.
 * Kept un-exported so consumers cannot accidentally inject the options
 * instead of the service.
 */
export const LOGGER_OPTIONS = 'LOGGER_OPTIONS';

/**
 * Global NestJS module that registers the shared pino logger.
 *
 * Marked `@Global()` so any feature module can inject the logger via
 * `@Inject(LOGGER_SERVICE)` without re-importing this module.
 */
@Global()
@Module({})
export class LoggerModule {
  static forRoot(options: PinoLoggerOptions): DynamicModule {
    const optionsProvider: Provider = {
      provide: LOGGER_OPTIONS,
      useValue: options,
    };

    const loggerProvider: Provider = {
      provide: LOGGER_SERVICE,
      useFactory: (opts: PinoLoggerOptions) => new PinoLoggerService(opts),
      inject: [LOGGER_OPTIONS],
    };

    return {
      module: LoggerModule,
      global: true,
      providers: [optionsProvider, loggerProvider],
      exports: [LOGGER_SERVICE],
    };
  }
}