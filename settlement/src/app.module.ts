import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LoggerModule as SharedLoggerModule } from '@goalxi/logger';
import { DatabaseConfigService } from './config/database.config';
import { GlobalExceptionFilter } from './common/global-exception.filter';
import { TrainingModule } from './training.module';
import { FanModule } from './fan.module';
import { PlayerWageModule } from './player-wage.module';
import { SchedulerModule } from './scheduler/scheduler.module';
import { TransferModule } from './transfer.module';
import { BootstrapModule } from './bootstrap/bootstrap.module';
import { StadiumConstructionModule } from './stadium-construction.module';

const isDevelopmentFromEnv = () =>
  (process.env.NODE_ENV || 'development') === 'development';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env'],
    }),
    BullModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        connection: {
          host: configService.getOrThrow('REDIS_HOST', { infer: true }),
          port: configService.getOrThrow<number>('REDIS_PORT', { infer: true }),
          password: configService.getOrThrow('REDIS_PASSWORD', { infer: true }),
        },
      }),
      inject: [ConfigService],
    }),
    TypeOrmModule.forRootAsync({
      useClass: DatabaseConfigService,
    }),
    TrainingModule,
    FanModule,
    PlayerWageModule,
    SchedulerModule,
    TransferModule,
    BootstrapModule,
    StadiumConstructionModule,
    SharedLoggerModule.forRoot({
      level:
        (process.env.APP_LOG_LEVEL as
          | 'fatal'
          | 'error'
          | 'warn'
          | 'info'
          | 'debug'
          | 'trace'
          | undefined) ?? (isDevelopmentFromEnv() ? 'debug' : 'warn'),
      service: 'settlement',
      isDevelopment: isDevelopmentFromEnv(),
      file: './logs/settlement.log',
      maxSize: 100 * 1024 * 1024,
      maxFiles: 7,
    }),
  ],
  controllers: [],
  providers: [
    // Global exception filter. Registered as a plain provider; main.ts
    // calls app.useGlobalFilters() to apply it.
    GlobalExceptionFilter,
  ],
})
export class AppModule {}
