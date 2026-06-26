import { LoggerService } from '@nestjs/common';
import pino, { type LevelWithSilent } from 'pino';
import type { PinoLoggerOptions } from './logger.types';

/**
 * pino-backed implementation of NestJS LoggerService.
 *
 * In development, pretty-prints to stdout so logs are visible in the
 * terminal. In production, rolls to a file so log volume doesn't blow up
 * the dev machine's terminal and historical logs are still available for
 * post-mortem.
 */
export class PinoLoggerService implements LoggerService {
  private logger: pino.Logger;

  constructor(options: PinoLoggerOptions) {
    const transport = options.isDevelopment
      ? pino.transport({
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'SYS:HH:MM:ss.l',
            ignore: 'pid,hostname,context,traceId',
            singleLine: false,
          },
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

  log(message: unknown, ...optionalParams: unknown[]): void {
    this.logger.info(this.formatMessage(message, ...optionalParams));
  }

  info(message: unknown, ...optionalParams: unknown[]): void {
    this.logger.info(this.formatMessage(message, ...optionalParams));
  }

  error(message: unknown, ...optionalParams: unknown[]): void {
    this.logger.error(this.formatMessage(message, ...optionalParams));
  }

  warn(message: unknown, ...optionalParams: unknown[]): void {
    this.logger.warn(this.formatMessage(message, ...optionalParams));
  }

  fatal(message: unknown, ...optionalParams: unknown[]): void {
    this.logger.fatal(this.formatMessage(message, ...optionalParams));
  }

  debug(message: unknown, ...optionalParams: unknown[]): void {
    this.logger.debug(this.formatMessage(message, ...optionalParams));
  }

  verbose(message: unknown, ...optionalParams: unknown[]): void {
    this.logger.trace(this.formatMessage(message, ...optionalParams));
  }
}