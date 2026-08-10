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
 * Simulator-side global exception filter.
 *
 * Mirrors `settlement/src/common/global-exception.filter.ts`. The
 * simulator is a BullMQ worker (no HTTP boundary), so this filter mostly
 * catches:
 *   - Unhandled rejections in `SimulationProcessor.process()` after
 *     its own try/catch gives up
 *   - Anything thrown from `onModuleInit` / `onApplicationBootstrap`
 *     hooks (e.g. database connection failure, missing entity)
 *   - `@Cron` handler errors that bubble past the decorator's own
 *     error path
 *
 * Without this filter, those exceptions terminate the worker process
 * and leave nothing in the pino-roll log. With it, every error lands
 * on `logs/simulator.log` with a stack.
 */
@Catch()
@Injectable()
export class GlobalExceptionFilter implements ExceptionFilter {
  constructor(
    @Inject(LOGGER_SERVICE)
    private readonly logger: PinoLoggerService,
  ) {}

  catch(exception: unknown, _host: ArgumentsHost): void {
    const err =
      exception instanceof Error ? exception : new Error(String(exception));

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
        this.logger.error(
          `[Simulator] unhandled HttpException status=${status} message=${err.message}`,
          err.stack,
        );
      } else {
        this.logger.warn(
          `[Simulator] http exception status=${status} message=${err.message}`,
        );
      }
    } else {
      this.logger.error(
        `[Simulator] unhandled exception name=${err.name} message=${err.message}`,
        err.stack,
      );
    }
  }
}
