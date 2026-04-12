import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DatabaseConfigService } from './config/database.config';
import { TrainingModule } from './training.module';
import { FanModule } from './fan.module';
import { PlayerWageModule } from './player-wage.module';
import { SchedulerModule } from './scheduler/scheduler.module';
import { TransferModule } from './transfer.module';

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
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
