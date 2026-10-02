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
 * ## This filter cannot fire in this service
 *
 * It was previously registered via `app.useGlobalFilters(...)` in
 * `main.ts`, which made it look like the safety net for worker errors.
 * It is not, and cannot be:
 *
 *   - **HTTP.** A Nest global filter is invoked by the HTTP exception
 *     layer. Settlement declares no controllers, so there is no route
 *     to filter.
 *   - **Cron.** `@nestjs/schedule` wraps every `@Cron` / `@Interval` /
 *     `@Timeout` method in its *own* try/catch — see
 *     `ScheduleExplorer.wrapFunctionInTryCatchBlocks` in
 *     `node_modules/@nestjs/schedule` — which swallows the error and
 *     logs it through that module's logger. The exception never
 *     propagates to a Nest exception filter.
 *   - **BullMQ.** The `Worker` wraps `process()` in its own try/catch
 *     and reports failures through the queue's `failed` / `error`
 *     events. Also never a Nest exception filter.
 *
 * So the three cases this filter's original doc claimed to cover were
 * already being handled elsewhere, and a thrown cron error never
 * "terminated the worker process" as claimed — `@nestjs/schedule`
 * caught it first.
 *
 * Cron failures still reach pino-roll, just not through this filter:
 * `@nestjs/schedule` catches them and calls Nest's `Logger`, and
 * `main.ts` calls `app.useLogger(pino)`, which redirects every
 * `Logger.*` call in the process into the pino transport.
 * `ScheduleModule.forRoot()` is registered bare in
 * `scheduler.module.ts`, so there is no separate schedule-specific
 * logger to configure.
 *
 * It is retained (and still provided in `app.module.ts`) because it is
 * cheap and would become meaningful if settlement ever gains an HTTP
 * edge. It is no longer registered in `main.ts`, since
 * `INestApplicationContext` has no `useGlobalFilters`.
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
