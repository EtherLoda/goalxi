import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DatabaseConfigService } from './config/database.config';
import { GlobalExceptionFilter } from './common/global-exception.filter';
import { TrainingModule } from './training.module';
import { FanModule } from './fan.module';
import { PlayerWageModule } from './player-wage.module';
import { SchedulerModule } from './scheduler/scheduler.module';
import { TransferModule } from './transfer.module';
import { BootstrapModule } from './bootstrap/bootstrap.module';
import { StadiumConstructionModule } from './stadium-construction.module';

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
  ],
  controllers: [],
  providers: [
    // Global exception filter. Registered as a plain provider; main.ts
    // calls app.useGlobalFilters() to apply it.
    GlobalExceptionFilter,
  ],
})
export class AppModule {}
