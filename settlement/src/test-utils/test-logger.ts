import { LOGGER_SERVICE, PinoLoggerService } from '@goalxi/logger';

/**
 * Shared logger stub for unit tests.
 *
 * Every service / processor in `settlement` injects the shared
 * `PinoLoggerService` via the `LOGGER_SERVICE` DI token. Tests build
 * isolated `TestingModule`s that don't import `LoggerModule`, so we have
 * to register a stand-in provider. Use `LOGGER_SERVICE_PROVIDER` inside
 * the `providers` array of `Test.createTestingModule({...})`.
 */
/**
 * The stub's own shape. `child()` returns the stub itself, so the type
 * is self-referential — it must NOT claim to be a full
 * `PinoLoggerService`, or `nest build` (which type-checks `src/`,
 * test-utils included) rejects the assignment.
 *
 * `child` is declared as taking no arguments: the stub discards the
 * bindings it is handed.
 */
export type MockLogger = jest.Mocked<
  Pick<
    PinoLoggerService,
    'debug' | 'info' | 'warn' | 'error' | 'fatal' | 'verbose' | 'log'
  >
> & {
  child: jest.Mock<MockLogger, []>;
};

export const mockLogger: MockLogger = {
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  fatal: jest.fn(),
  verbose: jest.fn(),
  log: jest.fn(),
  // `TransferProcessor` calls `logger.child({ traceId })` when the job
  // carries a trace id. Returning this same stub keeps every recorded
  // call visible on `mockLogger` instead of on a throwaway object.
  child: jest.fn(() => mockLogger),
};

/**
 * Pre-built NestJS provider that registers the stub logger under
 * `LOGGER_SERVICE`. Pass it directly into `providers: [...]`.
 */
export const LOGGER_SERVICE_PROVIDER = {
  provide: LOGGER_SERVICE,
  useValue: mockLogger,
};
