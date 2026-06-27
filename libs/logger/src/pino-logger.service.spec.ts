import { LoggerService } from '@nestjs/common';
import pino, { type LevelWithSilent } from 'pino';
import { PinoLoggerService } from './pino-logger.service';

/**
 * Build a PinoLoggerService whose underlying pino writer is captured into
 * `lines` so assertions can grep the output. Avoids the pino-roll /
 * pino-pretty transports so tests stay synchronous and dependency-free.
 */
function makeLogger(level: LevelWithSilent = 'trace') {
  const lines: string[] = [];
  const stream = {
    write(s: string) {
      lines.push(s);
      return true;
    },
  };
  const captured = pino({ level, name: 'test' }, stream);
  const svc = new PinoLoggerService({
    level,
    service: 'test',
    isDevelopment: true,
  });
  (svc as unknown as { logger: pino.Logger }).logger = captured;
  return { svc, lines, stream };
}

describe('PinoLoggerService', () => {
  it('implements the NestJS LoggerService surface (excluding info, which is an alias of log)', () => {
    const { svc } = makeLogger();
    const methods: (keyof LoggerService)[] = [
      'log',
      'warn',
      'error',
      'debug',
      'fatal',
      'verbose',
    ];
    for (const m of methods) {
      expect(typeof svc[m]).toBe('function');
    }
    // info() is provided as a pino-specific convenience alias of log().
    expect(typeof (svc as unknown as { info: unknown }).info).toBe('function');
  });

  describe('formatMessage', () => {
    it('emits a string message verbatim', () => {
      const { svc, lines } = makeLogger();
      svc.info('hello world');
      const combined = lines.join('');
      expect(combined).toContain('hello world');
    });

    it('appends string params with a space separator', () => {
      const { svc, lines } = makeLogger();
      svc.info('user signed in', 'user-42', 'email=a@b.c');
      const combined = lines.join('');
      expect(combined).toContain('user signed in user-42 email=a@b.c');
    });

    it('JSON-stringifies object params', () => {
      const { svc, lines } = makeLogger();
      svc.info('tx', { amount: 100, currency: 'USD' });
      // Pino emits a JSON line. Both the message and the params land in
      // the same line, so just assert the keys appear.
      const combined = lines.join('');
      expect(combined).toContain('amount');
      expect(combined).toContain('100');
      expect(combined).toContain('currency');
      expect(combined).toContain('USD');
    });

    it('emits a JSON object when the message itself is an object', () => {
      const { svc, lines } = makeLogger();
      svc.info({ event: 'signin', userId: 'u-1' });
      const combined = lines.join('');
      expect(combined).toContain('event');
      expect(combined).toContain('signin');
      expect(combined).toContain('userId');
      expect(combined).toContain('u-1');
    });
  });

  describe('level mapping', () => {
    it.each([
      ['log', 'info'],
      ['warn', 'warn'],
      ['error', 'error'],
      ['debug', 'debug'],
      ['fatal', 'fatal'],
      ['verbose', 'trace'], // verbose maps to pino.trace
    ] as const)('%s() emits at pino level %s', (method, level) => {
      const { svc, lines } = makeLogger('trace');
      (svc[method] as (m: string) => void)(`level-test-${method}`);
      const combined = lines.join('');
      expect(combined).toContain(`"level":${level === 'trace' ? '10' : level === 'debug' ? '20' : level === 'info' ? '30' : level === 'warn' ? '40' : level === 'error' ? '50' : '60'}`);
    });
  });

  describe('child()', () => {
    it('returns a new PinoLoggerService instance', () => {
      const { svc } = makeLogger();
      const child = svc.child({ traceId: 'req-abc' });
      expect(child).toBeInstanceOf(PinoLoggerService);
      expect(child).not.toBe(svc);
    });

    it('binds traceId to every subsequent log line', () => {
      const parentLines: string[] = [];
      const parentStream = {
        write: (s: string) => {
          parentLines.push(s);
          return true;
        },
      };
      const parent = pino({ level: 'trace', name: 'test' }, parentStream);
      const svc = new PinoLoggerService({
        level: 'trace',
        service: 'test',
        isDevelopment: true,
      });
      (svc as unknown as { logger: pino.Logger }).logger = parent;

      const child = svc.child({ traceId: 'req-abc123' });
      // The child shares the parent's underlying stream (parentStream) but
      // with the traceId binding.
      child.info('hello child');

      const combined = parentLines.join('');
      expect(combined).toContain('traceId');
      expect(combined).toContain('req-abc123');
      expect(combined).toContain('hello child');
    });
  });
});