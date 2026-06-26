import { ApiModule } from '@/api/api.module';
import authConfig from '@/api/auth/config/auth.config';
import { BackgroundModule } from '@/background/background.module';
import appConfig from '@/config/app.config';
import { AllConfigType } from '@/config/config.type';
import { Environment } from '@/constants/app.constant';
import databaseConfig from '@/database/config/database.config';
import { TypeOrmConfigService } from '@/database/typeorm-config.service';
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
import {
  AcceptLanguageResolver,
  HeaderResolver,
  I18nModule,
  QueryResolver,
} from 'nestjs-i18n';
import { LoggerModule } from 'nestjs-pino';
import path from 'path';
import { DataSource, DataSourceOptions } from 'typeorm';
import loggerFactory from './logger-factory';

function generateModulesSet() {
  const imports: ModuleMetadata['imports'] = [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [appConfig, databaseConfig, redisConfig, authConfig, mailConfig],
      envFilePath: ['.env'],
    }),
  ];
  let customModules: ModuleMetadata['imports'] = [];

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

  const modulesSet = process.env.MODULES_SET || 'monolith';

  switch (modulesSet) {
    case 'monolith':
      customModules = [
        ApiModule,
        bullModule,
        BackgroundModule,
        cacheModule,
        dbModule,
        i18nModule,
        loggerModule,
        sharedLoggerModule,
        MailModule,
        RedisModule,
      ];
      break;
    case 'api':
      customModules = [
        ApiModule,
        bullModule,
        cacheModule,
        dbModule,
        i18nModule,
        loggerModule,
        sharedLoggerModule,
        MailModule,
        RedisModule,
      ];
      break;
    case 'background':
      customModules = [
        bullModule,
        BackgroundModule,
        cacheModule,
        dbModule,
        i18nModule,
        loggerModule,
        sharedLoggerModule,
        RedisModule,
      ];
      break;
    default:
      console.error(`Unsupported modules set: ${modulesSet}`);
      break;
  }

  return imports.concat(customModules);
}

function isDevelopmentFromEnv(): boolean {
  return (process.env.NODE_ENV || 'development') === 'development';
}

export default generateModulesSet;
