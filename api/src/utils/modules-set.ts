import { ApiModule } from '@/api/api.module';
import authConfig from '@/api/auth/config/auth.config';
import { BackgroundModule } from '@/background/background.module';
import appConfig from '@/config/app.config';
import { AllConfigType } from '@/config/config.type';
import { Environment } from '@/constants/app.constant';
import databaseConfig from '@/database/config/database.config';
import { TypeOrmConfigService } from '@/database/typeorm-config.service';
import { HealthModule } from '@/health/health.module';
import mailConfig from '@/mail/config/mail.config';
import { MailModule } from '@/mail/mail.module';
import redisConfig from '@/redis/config/redis.config';
import { RedisModule } from '@/redis/redis.module';
import { LoggerModule as SharedLoggerModule } from '@goalxi/logger';
import { BullModule } from '@nestjs/bullmq';
import { CacheModule } from '@nestjs/cache-manager';
import { ModuleMetadata } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { redisStore } from 'cache-manager-ioredis-yet';
import type { Request } from 'express';
import { ClsModule } from 'nestjs-cls';
import {
  AcceptLanguageResolver,
  HeaderResolver,
  I18nModule,
  QueryResolver,
} from 'nestjs-i18n';
import { LoggerModule } from 'nestjs-pino';
import path from 'path';
import { DataSource, DataSourceOptions } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import loggerFactory from './logger-factory';
import { TraceIdMiddleware } from './trace-id.middleware';

function generateModulesSet(): ModuleMetadata['imports'] {
  const imports: ModuleMetadata['imports'] = [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [appConfig, databaseConfig, redisConfig, authConfig, mailConfig],
      envFilePath: ['.env'],
    }),
  ];
  let customModules: ModuleMetadata['imports'] = [];

  // CLS: scoped to each request so service code can read the inbound
  // traceId (X-Request-Id header) without threading it through every
  // method signature. See TraceIdMiddleware + TraceIdMiddleware.HANDLER
  // wiring in AppModule / main.ts.
  const clsModule = ClsModule.forRoot({
    global: true,
    middleware: {
      mount: true,
      generateId: false, // we use our own id (incoming header or uuid)
      idGenerator: (req: Request) =>
        ((req.headers['x-request-id'] as string | undefined) || '').trim() ||
        `req-${uuidv4()}`,
      setup: (cls, req, res) => {
        const traceId =
          ((req.headers['x-request-id'] as string | undefined) || '').trim() ||
          `req-${uuidv4()}`;
        cls.set(TraceIdMiddleware.CLS_KEY, traceId);
        res.setHeader('x-request-id', traceId);
      },
    },
  });

  const dbModule = TypeOrmModule.forRootAsync({
    useClass: TypeOrmConfigService,
    dataSourceFactory: async (options: DataSourceOptions) => {
      if (!options) {
        throw new Error('Invalid options passed');
      }

      return new DataSource(options).initialize();
    },
  });

  const bullModule = BullModule.forRootAsync({
    imports: [ConfigModule],
    useFactory: (configService: ConfigService<AllConfigType>) => {
      return {
        connection: {
          host: configService.getOrThrow('redis.host', {
            infer: true,
          }),
          port: configService.getOrThrow('redis.port', {
            infer: true,
          }),
          password: configService.getOrThrow('redis.password', {
            infer: true,
          }),
          tls: configService.get('redis.tlsEnabled', { infer: true }),
        },
      };
    },
    inject: [ConfigService],
  });

  const i18nModule = I18nModule.forRootAsync({
    resolvers: [
      { use: QueryResolver, options: ['lang'] },
      AcceptLanguageResolver,
      new HeaderResolver(['x-lang']),
    ],
    useFactory: (configService: ConfigService<AllConfigType>) => {
      const env = configService.get('app.nodeEnv', { infer: true });
      const isLocal = env === Environment.LOCAL;
      const isDevelopment = env === Environment.DEVELOPMENT;
      return {
        fallbackLanguage: configService.getOrThrow('app.fallbackLanguage', {
          infer: true,
        }),
        loaderOptions: {
          path: path.join(__dirname, '/../i18n/'),
          watch: isLocal,
        },
        typesOutputPath: path.join(
          __dirname,
          '../../src/generated/i18n.generated.ts',
        ),
        logging: isLocal || isDevelopment, // log info on missing keys
      };
    },
    inject: [ConfigService],
  });

  const loggerModule = LoggerModule.forRootAsync({
    imports: [ConfigModule],
    inject: [ConfigService],
    useFactory: loggerFactory,
  });

  // Shared @goalxi/logger module — provides PinoLoggerService via the
  // LOGGER_SERVICE DI token for any service that wants to inject it.
  // Lives alongside nestjs-pino (which provides the HTTP request/response
  // middleware); the bootstrap call `app.useLogger(sharedLogger)` in
  // main.ts wires the shared instance into Nest's static logger.
  const sharedLoggerModule = SharedLoggerModule.forRoot({
    level:
      (process.env.APP_LOG_LEVEL as
        | 'fatal'
        | 'error'
        | 'warn'
        | 'info'
        | 'debug'
        | 'trace'
        | undefined) ?? (isDevelopmentFromEnv() ? 'debug' : 'warn'),
    service: 'api',
    isDevelopment: isDevelopmentFromEnv(),
    file: './logs/api.log',
    maxSize: 100 * 1024 * 1024,
    maxFiles: 7,
  });

  const cacheModule = CacheModule.registerAsync({
    imports: [ConfigModule],
    useFactory: async (configService: ConfigService<AllConfigType>) => {
      return {
        store: await redisStore({
          host: configService.getOrThrow('redis.host', {
            infer: true,
          }),
          port: configService.getOrThrow('redis.port', {
            infer: true,
          }),
          password: configService.getOrThrow('redis.password', {
            infer: true,
          }),
          tls: configService.get('redis.tlsEnabled', { infer: true }),
        }),
      };
    },
    isGlobal: true,
    inject: [ConfigService],
  });

  // Default is `api`, NOT `monolith`.
  //
  // The `monolith` set used to differ from `api` only in that
  // `BackgroundModule` imported settlement's compiled `SchedulerModule`
  // and booted its ~26 `@Cron` handlers inside this process. Since the
  // `settlement` service boots those same crons itself, every default
  // deployment ran each one twice — with no distributed lock on the
  // multi-step unwrapped writes (season transition, promotion/relegation,
  // standings init). That import is gone; see
  // `api/src/background/background.module.ts` for the full rationale.
  //
  // `monolith` is kept as an accepted alias because operators already
  // have it in their env files and an unknown value silently drops to a
  // near-empty module list (see the `default:` branch), which is a much
  // worse failure mode than a deprecated alias.
  const modulesSet = process.env.MODULES_SET || 'api';

  switch (modulesSet) {
    // Alias of `api`. Identical module list — retained only so existing
    // deployments do not fall through to `default`.
    case 'monolith':
    case 'api':
      customModules = [
        ApiModule,
        bullModule,
        BackgroundModule,
        cacheModule,
        clsModule,
        dbModule,
        HealthModule,
        i18nModule,
        loggerModule,
        sharedLoggerModule,
        MailModule,
        RedisModule,
      ];
      break;
    // Worker-only slice: no `ApiModule`, so no controllers, no mail,
    // no `MailModule`. Runs the api-owned queue consumers
    // (`email`, `match-completion`, `finance-settlement`).
    //
    // NOTE: despite the name, this set registers NO cron of its own.
    // The only `@Cron` handlers reachable from `BackgroundModule` were
    // settlement's, and those were removed (see
    // `api/src/background/background.module.ts`). Settlement cron is
    // owned exclusively by the `settlement` process. If you were
    // splitting api into "HTTP" + "background" replicas, this set is
    // still correct for that — it just does not do more than `api`
    // does minus the HTTP surface.
    case 'background':
      customModules = [
        bullModule,
        BackgroundModule,
        cacheModule,
        clsModule,
        dbModule,
        HealthModule,
        i18nModule,
        loggerModule,
        sharedLoggerModule,
        RedisModule,
      ];
      break;
    default:
      // Do NOT silently fall through to a usable module list. A typo
      // in `MODULES_SET` used to produce a near-empty app that booted
      // "successfully" and served nothing. Fail the boot instead — the
      // operator is looking at these logs precisely because the
      // topology is wrong.
      throw new Error(
        `Unsupported modules set: ${modulesSet}. ` +
          `Expected one of: api (default), monolith (deprecated alias of api), background.`,
      );
  }

  return imports.concat(customModules);
}

function isDevelopmentFromEnv(): boolean {
  return (process.env.NODE_ENV || 'development') === 'development';
}

export default generateModulesSet;
