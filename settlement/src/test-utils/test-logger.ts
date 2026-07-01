import { LOGGER_SERVICE, PinoLoggerService } from '@goalxi/logger';

/**
 * Shared logger stub for unit tests.
 *
 * Every service / processor in `settlement` injects the shared
 * `PinoLoggerService` via the `LOGGER_SERVICE` DI token. Tests build
 * isolated `TestingModule`s that don't import `LoggerModule`, so we have
 * to register a stand-in provider. Use `createLoggerProvider()` inside
 * the `providers` array of `Test.createTestingModule({...})`.
 */
export const mockLogger: jest.Mocked<
  Pick<
    PinoLoggerService,
    'debug' | 'info' | 'warn' | 'error' | 'fatal' | 'verbose' | 'log'
  >
> = {
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  fatal: jest.fn(),
  verbose: jest.fn(),
  log: jest.fn(),
};

/**
 * Pre-built NestJS provider that registers the stub logger under
 * `LOGGER_SERVICE`. Pass it directly into `providers: [...]`.
 */
export const LOGGER_SERVICE_PROVIDER = {
  provide: LOGGER_SERVICE,
  useValue: mockLogger,
};
