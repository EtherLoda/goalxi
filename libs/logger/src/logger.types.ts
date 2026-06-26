import type { LevelWithSilent } from 'pino';

/**
 * Options accepted by `LoggerModule.forRoot()` and `PinoLoggerService`.
 *
 * `level` is the pino log level threshold. `service` is used as the pino
 * `name` field so multi-service logs can be filtered.
 *
 * `file`/`maxSize`/`maxFiles` are only honoured in production mode
 * (`isDevelopment: false`). They are ignored when pretty-printing to stdout.
 */
export interface PinoLoggerOptions {
  level: LevelWithSilent;
  service: string;
  isDevelopment: boolean;
  file?: string;
  maxSize?: number;
  maxFiles?: number;
}