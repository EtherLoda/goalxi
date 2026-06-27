# `@goalxi/logger`

Shared pino logger for the GoalXI monorepo (`api`, `simulator`, `settlement`).

## Why

Three services used to ship their own copy of `PinoLoggerService`. Bug fixes
and behaviour changes had to be applied three times. This package is the
single source of truth, plus a NestJS DI module so any service can pull the
logger via constructor injection.

## Install

Already wired into the workspace (`workspace:*`). If you add a new package,
add:

```jsonc
// <pkg>/package.json
{
  "dependencies": {
    "@goalxi/logger": "workspace:*"
  }
}
```

```jsonc
// <pkg>/tsconfig.json
{
  "compilerOptions": {
    "paths": {
      "@goalxi/logger": ["../libs/logger/dist"]
    }
  }
}
```

## Bootstrap (NestJS module)

```ts
// <pkg>/src/app.module.ts
import { LoggerModule as SharedLoggerModule } from '@goalxi/logger';

@Module({
  imports: [
    SharedLoggerModule.forRoot({
      level: process.env.APP_LOG_LEVEL ?? 'warn',
      service: 'api',              // emitted as the pino `name` field
      isDevelopment: process.env.NODE_ENV === 'development',
      file: './logs/api.log',      // prod only; ignored when isDevelopment
      maxSize: 100 * 1024 * 1024, // 100 MB before roll
      maxFiles: 7,
    }),
    // ...
  ],
})
export class AppModule {}
```

`SharedLoggerModule.forRoot` is a **global** DynamicModule — service classes
just declare `@Inject(LOGGER_SERVICE)` and Nest will resolve the singleton
instance.

### Level guidance

| Level    | Use for                                                            |
| -------- | ----------------------------------------------------------------- |
| `debug`  | Dev-only diagnostic data (high volume, e.g. per-event details).   |
| `info`   | Successful state transitions in business-critical paths.          |
| `warn`   | Recoverable anomalies (reused id, retry, skipped job).            |
| `error`  | Failed operation that callers will see. Always include the stack. |
| `fatal`  | Process cannot continue.                                         |

Production default is `warn` (`api.config.ts` / `fallback in forRoot`), so any
`info()`/`debug()` line is suppressed unless `APP_LOG_LEVEL=info` is set.

## Inject into a service

```ts
import { Inject } from '@nestjs/common';
import { LOGGER_SERVICE, PinoLoggerService } from '@goalxi/logger';

@Injectable()
export class AuthService {
  constructor(
    @Inject(LOGGER_SERVICE) private readonly logger: PinoLoggerService,
    // ...
  ) {}

  async signIn(dto: LoginReqDto) {
    this.logger.log(`[Auth] signIn attempt email=${dto.email}`);
    // ...
  }
}
```

`PinoLoggerService` implements NestJS `LoggerService` (the same interface as
`@nestjs/common` `Logger`), so all the usual methods are available:

```ts
this.logger.log('msg', optionalObj);
this.logger.info('msg');
this.logger.warn('msg');
this.logger.error('msg', err.stack);
this.logger.debug('msg');
this.logger.fatal('msg');
this.logger.verbose('msg'); // maps to pino.trace
```

## traceId propagation (BullMQ)

HTTP requests carry a `X-Request-Id` (or one is generated). The api service
stores it on a CLS context (see `api/src/utils/trace-id.middleware.ts`) and
writes it onto `job.data.traceId` whenever it enqueues a BullMQ job.

Workers propagate traceId to every log line via `pino.child`:

```ts
async process(job: Job<MyJobData>): Promise<void> {
  this.jobLog = job.data.traceId
    ? this.logger.child({ traceId: job.data.traceId })
    : this.logger;
  this.jobLog.info('worker started');
  // ... every this.jobLog.* line below carries the traceId
}
```

`child()` is a thin wrapper over `pino.child(bindings)` that returns a new
`PinoLoggerService` instance with the bindings baked in.

End-to-end: `grep "<traceId>" logs/*.log` pulls every log line for one
request across the api HTTP boundary, the simulator BullMQ job, and the
settlement worker that follows it.

## Transports

| Mode             | Transport      | Output                         |
| ---------------- | -------------- | ------------------------------ |
| `isDevelopment`  | `pino-pretty`  | stdout, colorised, single line |
| `!isDevelopment` | `pino-roll`    | rolling file (`<file>`)        |

The default file is `./logs/<service>.log` with 100 MB / 7 files rotation.
Override via `file` / `maxSize` / `maxFiles` options.

## Logging fields

`pino-pretty` and `pino-roll` ignore these keys to keep lines compact:

- `pid`, `hostname`, `context`, `traceId`

So `traceId=req-abc123` appears at the start of every line, followed by the
message body. This means tools that split on whitespace can extract traceId
as the first field.