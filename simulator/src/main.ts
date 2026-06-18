import { NestFactory } from '@nestjs/core';
import { LoggerService } from '@nestjs/common';
import pino from 'pino';
import { AppModule } from './app.module';

class PinoLoggerService implements LoggerService {
  private logger: pino.Logger;

  constructor(options: {
    level: pino.LevelWithSilent;
    service: string;
    isDevelopment: boolean;
    file?: string;
    maxSize?: number;
    maxFiles?: number;
  }) {
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
            file: options.file ?? './logs/simulator.log',
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

const isDevelopment =
  (process.env.NODE_ENV || 'development') === 'development';

const logger = new PinoLoggerService({
  level: (process.env.APP_LOG_LEVEL as pino.LevelWithSilent | undefined) ??
    (isDevelopment ? 'debug' : 'warn'),
  service: 'simulator',
  isDevelopment,
  file: './logs/simulator.log',
  maxSize: 100 * 1024 * 1024,
  maxFiles: 7,
});

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    bufferLogs: true,
    logger,
  });

  logger.warn('Simulator service started');
}
bootstrap();
