import {
  CallHandler,
  ExecutionContext,
  Inject,
  Injectable,
  LoggerService,
  NestInterceptor,
} from '@nestjs/common';
import { LOGGER_SERVICE } from '@goalxi/logger';
import { Request, Response } from 'express';
import { Observable, tap } from 'rxjs';

/**
 * Application-wide HTTP access log.
 *
 * Captures every incoming controller invocation with:
 *   - HTTP method + route pattern (e.g. `PATCH /teams/:id`)
 *   - authenticated user id (from `req.user.id`, set by AuthGuard)
 *   - class.method of the handler
 *   - response status code
 *   - wall-clock duration in milliseconds
 *   - thrown error (when applicable)
 *
 * Registered globally via `APP_INTERCEPTOR` token in AppModule so the 26
 * existing controllers get coverage without touching any business code.
 *
 * Why both this AND `nestjs-pino`'s pinoHttp middleware?
 *   - pino-http records raw HTTP bytes (status, content-length, ua).
 *   - This interceptor records the business context (userId, handler,
 *     application-level duration excluding framework overhead).
 */
@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  constructor(
    @Inject(LOGGER_SERVICE) private readonly logger: LoggerService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const req = http.getRequest<Request & { user?: { id?: string } }>();
    const res = http.getResponse<Response>();
    const handlerName = `${context.getClass().name}.${context.getHandler().name}`;
    const method = req.method;
    const url = req.originalUrl ?? req.url;
    const userId = req.user?.id ?? null;
    const start = Date.now();

    return next.handle().pipe(
      tap({
        next: () => {
          const status = res.statusCode;
          const durationMs = Date.now() - start;
          this.logger.log(
            `[Http] ${method} ${url} handler=${handlerName} userId=${userId ?? '-'} status=${status} durationMs=${durationMs}`,
          );
        },
        error: (err: Error) => {
          const durationMs = Date.now() - start;
          // res.statusCode may still be default (200) at this point because
          // the exception filter hasn't run yet; fall back to 500.
          const status = res.statusCode && res.statusCode !== 200
            ? res.statusCode
            : 500;
          this.logger.error(
            `[Http] ${method} ${url} handler=${handlerName} userId=${userId ?? '-'} status=${status} durationMs=${durationMs} error=${err.message}`,
          );
        },
      }),
    );
  }
}