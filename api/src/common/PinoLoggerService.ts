import { LoggerService } from '@nestjs/common';
import pino, { type LevelWithSilent } from 'pino';

export class PinoLoggerService implements LoggerService {
  private logger: pino.Logger;

  constructor(options: {
    level: LevelWithSilent;
    service: string;
    isDevelopment: boolean;
    file?: string;
    maxSize?: number;
    maxFiles?: number;
  }) {
    // In development, pretty-print to stdout so logs are visible in the
    // terminal. In production, keep the existing file-rolling behavior so
    // log volume doesn't blow up the dev machine's terminal and historical
    // logs are still available for post-mortem.
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
            file: options.file ?? './logs/api.log',
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

  log(message: unknown, ...optionalParams: unknown[]) {
    this.logger.info(this.formatMessage(message, ...optionalParams));
  }

  info(message: unknown, ...optionalParams: unknown[]) {
    this.logger.info(this.formatMessage(message, ...optionalParams));
  }

  error(message: unknown, ...optionalParams: unknown[]) {
    this.logger.error(this.formatMessage(message, ...optionalParams));
  }

  warn(message: unknown, ...optionalParams: unknown[]) {
    this.logger.warn(this.formatMessage(message, ...optionalParams));
  }

  fatal(message: unknown, ...optionalParams: unknown[]) {
    this.logger.fatal(this.formatMessage(message, ...optionalParams));
  }

  debug(message: unknown, ...optionalParams: unknown[]) {
    this.logger.debug(this.formatMessage(message, ...optionalParams));
  }

  verbose(message: unknown, ...optionalParams: unknown[]) {
    this.logger.trace(this.formatMessage(message, ...optionalParams));
  }
}
