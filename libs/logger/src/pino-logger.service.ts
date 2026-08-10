import { LoggerService } from '@nestjs/common';
import pino, { type LevelWithSilent } from 'pino';
import type { PinoLoggerOptions } from './logger.types';

/**
 * pino-backed implementation of NestJS LoggerService.
 *
 * In **production**, the only target is `pino-roll` writing to a file —
 * the OpenObserve pipeline (vector tail) reads that file as NDJSON.
 *
 * In **development**, two targets are wired simultaneously via pino's
 * built-in `targets: []` fan-out:
 *   1. `pino-pretty` to stdout — colored, single-line, for the dev's
 *      terminal eyes. (The Vector/OpenObserve pipeline never sees this
 *      output — it lives in the container's stdout, not a file.)
 *   2. `pino-roll` to the same file path as production — so that
 *      `pnpm dev` (or `docker compose up` with the dev image) also
 *      produces a file Vector can tail. Without this, dev logs would
 *      only exist in stdout and never reach OpenObserve.
 *
 * Each target receives the **raw JSON record** from pino. `pino-pretty`
 * formats its copy for humans; `pino-roll` writes its copy verbatim as
 * NDJSON. This is critical — if pretty output leaked into the file,
 * Vector's `decoding.codec = "json"` would fail on the multi-line
 * human-readable text.
 */
export class PinoLoggerService implements LoggerService {
  private logger: pino.Logger;

  constructor(options: PinoLoggerOptions) {
    const transport = options.isDevelopment
      ? pino.transport({
          targets: [
            {
              target: 'pino-pretty',
              options: {
                colorize: true,
                translateTime: 'SYS:HH:MM:ss.l',
                ignore: 'pid,hostname,context,traceId',
                singleLine: false,
              },
              level: options.level,
            },
            {
              target: 'pino-roll',
              options: {
                file: options.file ?? './logs/app.log',
                size: options.maxSize ?? 100 * 1024 * 1024,
                maxFiles: options.maxFiles ?? 7,
                mkdir: true,
              },
              level: options.level,
            },
          ],
        })
      : pino.transport({
          target: 'pino-roll',
          options: {
            file: options.file ?? './logs/app.log',
            size: options.maxSize ?? 100 * 1024 * 1024,
            maxFiles: options.maxFiles ?? 7,
            mkdir: true,
          },
        });

    this.logger = pino(
      {
        level: options.level,
        name: options.service,
      },
      transport,
    );
  }

  /**
   * Returns a child logger that automatically attaches `bindings` to every
   * log line. Used by BullMQ workers to propagate the inbound `traceId`
   * (X-Request-Id from the originating HTTP request) through every log
   * line emitted while processing the job.
   *
   * @example
   *   const log = this.logger.child({ traceId: job.data.traceId });
   *   log.info('simulation started');
   *   // -> [2026-06-27 ...] traceId=req-abc123 msg="simulation started"
   */
  child(bindings: Record<string, unknown>): PinoLoggerService {
    const child = Object.create(PinoLoggerService.prototype) as PinoLoggerService;
    (child as unknown as { logger: pino.Logger }).logger = this.logger.child(
      bindings,
    );
    return child;
  }

  private formatMessage(
    message: unknown,
    ...optionalParams: unknown[]
  ): string {
    if (typeof message === 'string') {
      if (optionalParams.length > 0) {
        const paramsStr = optionalParams
          .map((p) => (typeof p === 'object' ? JSON.stringify(p) : String(p)))
          .join(' ');
        return `${message} ${paramsStr}`;
      }
      return message;
    }
    return JSON.stringify(message);
  }

  /**
   * Map the first extra arg of error/warn/fatal into pino's standard
   * `err` merging field when it looks like an error.
   *
   * Conventions matched:
   *   - `Error` instance  → `{ err: <Error> }`
   *     We hand pino the Error itself (not a pre-extracted plain object)
   *     so pino's std `err` serializer runs. The serializer uses
   *     `err.constructor.name` for the `type` field — for a real
   *     `new Error(...)` that resolves to `"Error"`, whereas a plain
   *     object `{type, message, stack}` would resolve to `"Object"`,
   *     which is why we don't expand manually.
   *   - `string`          → `{ err: <Error> }` with the string as stack
   *     (matches the existing call sites in match-completion /
   *      finance-settlement / simulation processors, which all pass
   *      `error.stack` as the second arg)
   *   - anything else / undefined → undefined (caller falls back to the
   *     legacy `formatMessage` behaviour)
   */
  private errFieldFromFirstParam(
    value: unknown,
  ): Record<string, unknown> | undefined {
    if (value === undefined || value === null) return undefined;
    if (value instanceof Error) {
      return { err: value };
    }
    if (typeof value === 'string') {
      // Wrap the string in a synthetic Error so pino's std err serializer
      // also picks it up. `name = 'StackTrace'` flags the row as
      // "stack-only, no real error" so log consumers can tell.
      const e = new Error();
      e.name = 'StackTrace';
      e.message = '';
      e.stack = value;
      return { err: e };
    }
    return undefined;
  }

  log(message: unknown, ...optionalParams: unknown[]): void {
    this.logger.info(this.formatMessage(message, ...optionalParams));
  }

  info(message: unknown, ...optionalParams: unknown[]): void {
    this.logger.info(this.formatMessage(message, ...optionalParams));
  }

  error(message: unknown, ...optionalParams: unknown[]): void {
    const errField = this.errFieldFromFirstParam(optionalParams[0]);
    if (errField) {
      // Drop the consumed first arg so its content doesn't also land in
      // the human-readable `msg` (would be double-printed).
      this.logger.error(
        errField,
        this.formatMessage(message, ...optionalParams.slice(1)),
      );
      return;
    }
    this.logger.error(this.formatMessage(message, ...optionalParams));
  }

  warn(message: unknown, ...optionalParams: unknown[]): void {
    const errField = this.errFieldFromFirstParam(optionalParams[0]);
    if (errField) {
      this.logger.warn(
        errField,
        this.formatMessage(message, ...optionalParams.slice(1)),
      );
      return;
    }
    this.logger.warn(this.formatMessage(message, ...optionalParams));
  }

  fatal(message: unknown, ...optionalParams: unknown[]): void {
    const errField = this.errFieldFromFirstParam(optionalParams[0]);
    if (errField) {
      this.logger.fatal(
        errField,
        this.formatMessage(message, ...optionalParams.slice(1)),
      );
      return;
    }
    this.logger.fatal(this.formatMessage(message, ...optionalParams));
  }

  debug(message: unknown, ...optionalParams: unknown[]): void {
    this.logger.debug(this.formatMessage(message, ...optionalParams));
  }

  verbose(message: unknown, ...optionalParams: unknown[]): void {
    this.logger.trace(this.formatMessage(message, ...optionalParams));
  }
}