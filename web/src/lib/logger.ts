import pino from 'pino';
import pinoRoll from 'pino-roll';

const isServer = typeof window === 'undefined';

// Only create file transport on the server
const transport = isServer
  ? pinoRoll({
      file: './logs/web.log',
      maxSize: 100 * 1024 * 1024, // 100MB
      maxFiles: 7,
      mkdir: true,
    })
  : undefined;

export const logger = pino(
  {
    level: 'warn',
    service: 'web',
  },
  transport,
);
