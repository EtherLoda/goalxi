import { PinoLoggerOptions } from './logger.types';

/**
 * Compile-time only test — ensures LoggerModuleOptions still exposes the
 * required surface that callers depend on (level / service / file / etc).
 * If someone drops a field, this file will fail to type-check.
 */
describe('LoggerModuleOptions', () => {
  it('has the documented shape', () => {
    const opts: PinoLoggerOptions = {
      level: 'info',
      service: 'api',
      isDevelopment: false,
      file: './logs/api.log',
      maxSize: 1024,
      maxFiles: 7,
    };
    expect(opts.level).toBe('info');
    expect(opts.service).toBe('api');
    expect(opts.isDevelopment).toBe(false);
  });
});