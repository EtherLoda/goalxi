import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
} from '@nestjs/common';
import { LOGGER_SERVICE, PinoLoggerService } from '@goalxi/logger';

/**
 * Settlement-side global exception filter.
 *
 * Settlement has no HTTP boundary (controllers: []), so this filter mostly
 * catches:
 *   - Exceptions thrown during cron handler execution that bubble past
 *     @Cron decorator error handling
 *   - Unhandled rejections in BullMQ workers' `process()` paths that
 *     rethrow after BullMQ's own retry/abort logic runs out
 *   - Anything thrown from onModuleInit / onApplicationBootstrap hooks
 *
 * Without this filter, those exceptions terminate the worker process and
 * leave nothing in pino-roll. With it, every error lands on
 * `logs/settlement.log` with a stack, even if the original caller never
 * saw the error.
 */
@Catch()
@Injectable()
export class GlobalExceptionFilter implements ExceptionFilter {
  constructor(
    @Inject(LOGGER_SERVICE)
    private readonly logger: PinoLoggerService,
  ) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const err =
      exception instanceof Error ? exception : new Error(String(exception));

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
        this.logger.error(
          `[Settlement] unhandled HttpException status=${status} message=${err.message}`,
          err.stack,
        );
      } else {
        this.logger.warn(
          `[Settlement] http exception status=${status} message=${err.message}`,
        );
      }
    } else {
      this.logger.error(
        `[Settlement] unhandled exception name=${err.name} message=${err.message}`,
        err.stack,
      );
    }
  }
}
