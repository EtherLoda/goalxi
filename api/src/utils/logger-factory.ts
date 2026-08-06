import { type AllConfigType } from '@/config/config.type';
import { loggingRedactPaths, LogService } from '@/constants/app.constant';
import { ConfigService } from '@nestjs/config';
import { type IncomingMessage, type ServerResponse } from 'http';
import { Params } from 'nestjs-pino';
import { GenReqId, Options, type ReqId } from 'pino-http';
import { v4 as uuidv4 } from 'uuid';

// https://cloud.google.com/logging/docs/reference/v2/rest/v2/LogEntry#logseverity
const PinoLevelToGoogleLoggingSeverityLookup = Object.freeze({
  trace: 'DEBUG',
  debug: 'DEBUG',
  info: 'INFO',
  warn: 'WARNING',
  error: 'ERROR',
  fatal: 'CRITICAL',
});

const genReqId: GenReqId = (
  req: IncomingMessage,
  res: ServerResponse<IncomingMessage>,
) => {
  const id: ReqId = req.headers['x-request-id'] || uuidv4();
  res.setHeader('X-Request-Id', id.toString());
  return id;
};

const customSuccessMessage = (
  req: IncomingMessage,
  res: ServerResponse<IncomingMessage>,
  responseTime: number,
) => {
  // `userId` may be attached by AuthGuard onto `req.user`; default to "-"
  // for anonymous endpoints.
  const userId = (req as IncomingMessage & { user?: { id?: string } }).user?.id;
  return `[${req.id || '*'}] userId=${userId ?? '-'} "${req.method} ${req.url}" ${res.statusCode} - "${req.headers['host']}" "${req.headers['user-agent']}" - ${responseTime} ms`;
};

const customReceivedMessage = (req: IncomingMessage) => {
  return `[${req.id || '*'}] "${req.method} ${req.url}"`;
};

const customErrorMessage = (req, res, err) => {
  const userId = req.user?.id;
  return `[${req.id || '*'}] userId=${userId ?? '-'} "${req.method} ${req.url}" ${res.statusCode} - "${req.headers['host']}" "${req.headers['user-agent']}" - message: ${err.message}`;
};

function logServiceConfig(logService: string): Options {
  switch (logService) {
    case LogService.GOOGLE_LOGGING:
      return googleLoggingConfig();
    case LogService.AWS_CLOUDWATCH:
      return cloudwatchLoggingConfig();
    case LogService.CONSOLE:
    default:
      return consoleLoggingConfig();
  }
}

function cloudwatchLoggingConfig(): Options {
  // AWS CloudWatch is intentionally NOT implemented. The previous
  // version returned `{ messageKey: 'message' }` which silently
  // dropped all logs (the pino config that would actually push to
  // CloudWatch lives in `pino-cloudwatch` + an AWS SDK transport
  // — neither is in this project's dependencies). In production
  // that means "I set APP_LOG_SERVICE=aws_cloudwatch and now my
  // service runs mute" — a 24-hour blind spot.
  //
  // We fail loud instead: emit a one-shot stderr warning, then fall
  // back to the console transport so the dev/staging experience
  // still works. To actually wire CloudWatch, add `pino-cloudwatch`
  // + `@aws-sdk/client-cloudwatch-logs` to api/package.json and
  // replace this function with a `pino.transport({ target: 'pino-cloudwatch', options: {...} })` call.
  // eslint-disable-next-line no-console
  console.error(
    '[logger-factory] APP_LOG_SERVICE=aws_cloudwatch is requested but not implemented. ' +
      'Falling back to console transport. Add pino-cloudwatch + @aws-sdk/client-cloudwatch-logs to wire it up.',
  );
  return consoleLoggingConfig();
}

function googleLoggingConfig(): Options {
  return {
    messageKey: 'message',
    formatters: {
      level(label, number) {
        return {
          severity:
            PinoLevelToGoogleLoggingSeverityLookup[label] ||
            PinoLevelToGoogleLoggingSeverityLookup['info'],
          level: number,
        };
      },
    },
  };
}

function consoleLoggingConfig(): Options {
  return {
    messageKey: 'msg',
    transport: {
      target: 'pino-pretty',
      options: {
        singleLine: true,
        ignore:
          'req.id,req.method,req.url,req.headers,req.remoteAddress,req.remotePort,res.headers',
      },
    },
  };
}

async function loggerFactory(
  configService: ConfigService<AllConfigType>,
): Promise<Params> {
  const logLevel = configService.get('app.logLevel', { infer: true });
  const logService = configService.get('app.logService', { infer: true });
  const isDebug = configService.get('app.debug', { infer: true });

  const pinoHttpOptions: Options = {
    level: logLevel,
    genReqId: isDebug ? genReqId : undefined,
    serializers: isDebug
      ? {
          req: (req) => {
            req.body = req.raw.body;
            return req;
          },
        }
      : undefined,
    customSuccessMessage,
    customReceivedMessage,
    customErrorMessage,
    redact: {
      paths: loggingRedactPaths,
      censor: '**GDPR COMPLIANT**',
    }, // Redact sensitive information
    ...logServiceConfig(logService),
  };

  return {
    pinoHttp: pinoHttpOptions,
  };
}

export default loggerFactory;
