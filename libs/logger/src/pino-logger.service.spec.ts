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

  describe('err field (error/warn/fatal)', () => {
    it('error(message, Error) emits a structured err field with type/message/stack', () => {
      const { svc, lines } = makeLogger();
      const e = new Error('boom');
      svc.error('failed', e);
      const combined = lines.join('');
      expect(combined).toContain('"err"');
      expect(combined).toContain('"type":"Error"');
      expect(combined).toContain('"message":"boom"');
      expect(combined).toContain('"stack"');
      expect(combined).toContain('failed');
    });

    it('error(message, stackString) emits err.stack without duplicating the stack into msg', () => {
      const { svc, lines } = makeLogger();
      svc.error('failed', 'Error: boom\n    at /x.ts:1:1');
      const combined = lines.join('');
      expect(combined).toContain('"err"');
      expect(combined).toContain('Error: boom');
      // The stack text shouldn't ALSO appear inside the human msg
      // (avoids the same info being printed twice in OpenObserve).
      // We check by counting: the stack line begins with "at " and should
      // appear exactly once.
      const matches = combined.match(/at \/x\.ts:1:1/g) ?? [];
      expect(matches.length).toBe(1);
    });

    it('error(message) without an error arg keeps the legacy formatMessage behaviour', () => {
      const { svc, lines } = makeLogger();
      svc.error('plain failure');
      const combined = lines.join('');
      expect(combined).toContain('plain failure');
      expect(combined).not.toContain('"err"');
    });

    it('warn and fatal accept the same err conventions', () => {
      const { svc, lines } = makeLogger();
      const e = new Error('warn-boom');
      svc.warn('w', e);
      svc.fatal('f', 'FatalError: kaboom');
      const combined = lines.join('');
      expect(combined).toContain('"level":40'); // warn
      expect(combined).toContain('"level":60'); // fatal
      expect(combined).toContain('warn-boom');
      expect(combined).toContain('kaboom');
    });
  });

  /**
   * Dev mode wires two transports (pino-pretty to stdout + pino-roll
   * to file) via pino's `targets: []` fan-out. The file is what
   * Vector/OpenObserve tail, so it must contain NDJSON, not the
   * multi-line human-readable text that pino-pretty emits.
   *
   * We assert on the **transport config** pino receives rather than
   * spinning up real worker threads: pino 9's `transport` factory
   * uses `createRequire` on caller stack frames, which can't resolve
   * `pino-pretty` from inside jest's worker (pre-existing in this
   * repo — not caused by this change). The contract we care about is
   * that PinoLoggerService hands pino the right arguments; pino's
   * own fan-out is its responsibility.
   */
  describe('multi-target dev mode (transport config)', () => {
    let transportSpy: jest.SpyInstance;

    beforeEach(() => {
      // Return a stand-in stream — we never call methods on it.
      transportSpy = jest
        .spyOn(pino, 'transport')
        .mockReturnValue({} as unknown as ReturnType<typeof pino.transport>);
    });

    afterEach(() => {
      transportSpy.mockRestore();
    });

    it('dev mode wires pino-pretty (stdout) AND pino-roll (file) via targets[]', () => {
      new PinoLoggerService({
        level: 'info',
        service: 'api',
        isDevelopment: true,
        file: '/tmp/x.log',
      });

      expect(transportSpy).toHaveBeenCalledTimes(1);
      const arg = transportSpy.mock.calls[0][0] as {
        targets: Array<{ target: string; level: string }>;
      };
      expect(arg.targets).toHaveLength(2);

      const pretty = arg.targets.find((t) => t.target === 'pino-pretty');
      const roll = arg.targets.find((t) => t.target === 'pino-roll');
      expect(pretty).toBeDefined();
      expect(roll).toBeDefined();
      // both targets respect the configured level
      expect(pretty?.level).toBe('info');
      expect(roll?.level).toBe('info');
    });

    it('prod mode uses a single pino-roll target (no pretty stdout)', () => {
      new PinoLoggerService({
        level: 'info',
        service: 'api',
        isDevelopment: false,
        file: '/tmp/x.log',
      });

      expect(transportSpy).toHaveBeenCalledTimes(1);
      const arg = transportSpy.mock.calls[0][0] as {
        target?: string;
        targets?: unknown[];
      };
      expect(arg.target).toBe('pino-roll');
      expect(arg.targets).toBeUndefined();
    });

    it('pino-roll target receives the same file/size/maxFiles as prod', () => {
      new PinoLoggerService({
        level: 'warn',
        service: 'simulator',
        isDevelopment: true,
        file: '/var/logs/sim.log',
        maxSize: 5_000_000,
        maxFiles: 3,
      });

      const arg = transportSpy.mock.calls[0][0] as {
        targets: Array<{
          target: string;
          options: { file: string; size: number; maxFiles: number; mkdir: boolean };
          level: string;
        }>;
      };
      const roll = arg.targets.find((t) => t.target === 'pino-roll');
      expect(roll?.options.file).toBe('/var/logs/sim.log');
      expect(roll?.options.size).toBe(5_000_000);
      expect(roll?.options.maxFiles).toBe(3);
      expect(roll?.options.mkdir).toBe(true);
      expect(roll?.level).toBe('warn');
    });
  });
});