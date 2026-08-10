import { Logger } from '@nestjs/common';
import { LoggerLevel } from 'nodemailer/lib/shared';
import MailerCustomLogger from './mailer-custom-logger';

describe('MailerCustomLogger', () => {
  let logger: Logger;
  let mailerCustomLogger: MailerCustomLogger;
  // The constructor now reads `APP_LOG_LEVEL` to decide which mailer
  // log levels to forward. We pin the env to `trace` for the "default
  // / full" cases so the existing assertions still cover the
  // every-level-enabled path. The "honors APP_LOG_LEVEL" test below
  // then verifies the env-driven behaviour itself.
  const originalAppLogLevel = process.env.APP_LOG_LEVEL;

  beforeEach(() => {
    process.env.APP_LOG_LEVEL = 'trace';
    logger = new Logger('TestLogger');
    jest.spyOn(logger, 'log').mockImplementation(() => {});
    jest.spyOn(logger, 'debug').mockImplementation(() => {});
    jest.spyOn(logger, 'warn').mockImplementation(() => {});
    jest.spyOn(logger, 'error').mockImplementation(() => {});
    mailerCustomLogger = new MailerCustomLogger(logger);
  });

  afterEach(() => {
    jest.clearAllMocks();
    if (originalAppLogLevel === undefined) {
      delete process.env.APP_LOG_LEVEL;
    } else {
      process.env.APP_LOG_LEVEL = originalAppLogLevel;
    }
  });

  it('should initialize logger property correctly', () => {
    const mailerLogger = new MailerCustomLogger(logger);
    expect(mailerLogger['logger']).toBe(logger);
  });

  it('should default logLevels to every level when APP_LOG_LEVEL=trace', () => {
    const mailerLogger = new MailerCustomLogger(logger);
    expect(mailerLogger['logLevels']).toEqual([
      'trace',
      'debug',
      'info',
      'warn',
      'error',
      'fatal',
    ]);
  });

  it('should initialize logLevels property with provided values', () => {
    const customLogLevels = ['info', 'error'] as LoggerLevel[];
    const mailerLogger = new MailerCustomLogger(logger, customLogLevels);
    expect(mailerLogger['logLevels']).toEqual(customLogLevels);
  });

  it('should drop lower levels when APP_LOG_LEVEL=warn (the prod default)', () => {
    process.env.APP_LOG_LEVEL = 'warn';
    const mailerLogger = new MailerCustomLogger(logger);
    expect(mailerLogger['logLevels']).toEqual(['warn', 'error', 'fatal']);
  });

  it('should emit no mailer logs when APP_LOG_LEVEL=silent', () => {
    process.env.APP_LOG_LEVEL = 'silent';
    const mailerLogger = new MailerCustomLogger(logger);
    expect(mailerLogger['logLevels']).toEqual([]);
  });

  it('should create an instance using getInstance', () => {
    const instance = MailerCustomLogger.getInstance();
    expect(instance).toBeInstanceOf(MailerCustomLogger);
  });

  it('should log trace messages if trace level is enabled', () => {
    mailerCustomLogger.trace({ tnx: 'server' }, 'message');
    expect(logger.log).toHaveBeenCalledWith('S: message');
  });

  it('should drop trace messages when APP_LOG_LEVEL=warn', () => {
    process.env.APP_LOG_LEVEL = 'warn';
    const warnLogger = new MailerCustomLogger(logger);
    warnLogger.trace({ tnx: 'server' }, 'message');
    expect(logger.log).not.toHaveBeenCalled();
  });

  it('should log debug messages if debug level is enabled', () => {
    mailerCustomLogger.debug({ tnx: 'client' }, 'message');
    expect(logger.debug).toHaveBeenCalledWith('C: message');
  });

  it('should log info messages if info level is enabled', () => {
    mailerCustomLogger.info({ tnx: 'server' }, 'message');
    expect(logger.log).toHaveBeenCalledWith('S: message');
  });

  it('should log warn messages if warn level is enabled', () => {
    mailerCustomLogger.warn({ tnx: 'client' }, 'message');
    expect(logger.warn).toHaveBeenCalledWith('C: message');
  });

  it('should log error messages if error level is enabled', () => {
    mailerCustomLogger.error({ tnx: 'server' }, 'message');
    expect(logger.error).toHaveBeenCalledWith('S: message');
  });

  it('should log fatal messages if fatal level is enabled', () => {
    mailerCustomLogger.fatal({ tnx: 'client' }, 'message');
    expect(logger.error).toHaveBeenCalledWith('C: message');
  });

  it('should log messages using log method', () => {
    mailerCustomLogger.log('message');
    expect(logger.log).toHaveBeenCalledWith('message');
  });

  it('should return correct prefix from getPrefix', () => {
    const entry = { tnx: 'server', sid: '123', cid: '456' };
    const prefix = mailerCustomLogger['getPrefix'](entry);
    expect(prefix).toBe('[#456] [123] S: ');
  });
});
