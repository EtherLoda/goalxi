import { Logger } from '@nestjs/common';
import { LoggerLevel, Logger as NodeMailerLogger } from 'nodemailer/lib/shared';

/**
 * Map an `APP_LOG_LEVEL` string (the project's standard env) to the
 * nodemailer `LoggerLevel` list. Default to `'warn'` so SMTP traffic
 * doesn't drown dev logs unless the operator opts in.
 *
 * nodemailer doesn't define a `silent` level, so we map it to an empty
 * list (no mailer log line is ever emitted).
 */
const pinoToMailerLevels: Record<string, LoggerLevel[]> = {
  trace: ['trace', 'debug', 'info', 'warn', 'error', 'fatal'],
  debug: ['debug', 'info', 'warn', 'error', 'fatal'],
  info: ['info', 'warn', 'error', 'fatal'],
  warn: ['warn', 'error', 'fatal'],
  error: ['error', 'fatal'],
  fatal: ['fatal'],
  silent: [],
};

function mailerLogLevelsFromAppLogLevel(): LoggerLevel[] {
  const fromEnv = (process.env.APP_LOG_LEVEL ?? 'warn').toLowerCase();
  return pinoToMailerLevels[fromEnv] ?? pinoToMailerLevels['warn'];
}

class MailerCustomLogger implements NodeMailerLogger {
  /**
   * Postfix-#7: despite the `getInstance` name this returns a
   * fresh instance every call. The intent is to give mailer's
   * useFactory a one-liner; the name is misleading. Kept for
   * now because it's referenced by name from `mail.module.ts`
   * and renaming is a wider change than this audit. Adding a
   * JSDoc warning so the next reader doesn't think this is a
   * singleton.
   *
   * The optional `logLevels` override is kept for tests; production
   * callers should leave it unset and let the constructor derive the
   * level list from `APP_LOG_LEVEL` (see `mailerLogLevelsFromAppLogLevel`).
   */
  static getInstance(logLevels?: LoggerLevel[]): MailerCustomLogger {
    const logger = new Logger(MailerCustomLogger.name);
    return new MailerCustomLogger(logger, logLevels);
  }

  constructor(
    private readonly logger: Logger,
    private readonly logLevels: LoggerLevel[] = mailerLogLevelsFromAppLogLevel(),
  ) {}

  level(_level: LoggerLevel): void {}

  trace(...params: any[]): void {
    if (this.logLevels.includes('trace')) {
      this.logger.log(
        this.getPrefix(params[0]) + params[1],
        ...params.slice(2),
      );
    }
  }

  debug(...params: any[]): void {
    if (this.logLevels.includes('debug')) {
      this.logger.debug(
        this.getPrefix(params[0]) + params[1],
        ...params.slice(2),
      );
    }
  }

  info(...params: any[]): void {
    if (this.logLevels.includes('info')) {
      this.logger.log(
        this.getPrefix(params[0]) + params[1],
        ...params.slice(2),
      );
    }
  }

  warn(...params: any[]): void {
    if (this.logLevels.includes('warn')) {
      this.logger.warn(
        this.getPrefix(params[0]) + params[1],
        ...params.slice(2),
      );
    }
  }

  error(...params: any[]): void {
    if (this.logLevels.includes('error')) {
      this.logger.error(
        this.getPrefix(params[0]) + params[1],
        ...params.slice(2),
      );
    }
  }

  fatal(...params: any[]): void {
    if (this.logLevels.includes('fatal')) {
      this.logger.error(
        this.getPrefix(params[0]) + params[1],
        ...params.slice(2),
      );
    }
  }

  log(message: string) {
    if (this.logLevels.includes('info')) {
      this.logger.log(message);
    }
  }

  private getPrefix(entry: any) {
    let prefix = '';
    if (entry) {
      if (entry.tnx === 'server') {
        prefix = 'S: ';
      } else if (entry.tnx === 'client') {
        prefix = 'C: ';
      }

      if (entry.sid) {
        prefix = '[' + entry.sid + '] ' + prefix;
      }

      if (entry.cid) {
        prefix = '[#' + entry.cid + '] ' + prefix;
      }
    }

    return prefix;
  }
}

export default MailerCustomLogger;
