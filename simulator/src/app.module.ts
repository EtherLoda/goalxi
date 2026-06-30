import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { LoggerModule as SharedLoggerModule } from '@goalxi/logger';
import {
  UserEntity,
  SessionEntity,
  TeamEntity,
  LeagueEntity,
  MatchEntity,
  MatchTacticsEntity,
  TacticsPresetEntity,
  MatchEventEntity,
  MatchTeamStatsEntity,
  SeasonResultEntity,
  LeagueStandingEntity,
  FinanceEntity,
  PlayerEntity,
  TransactionEntity,
  AuctionEntity,
  PlayerEventEntity,
  PlayerTransactionEntity,
  InjuryEntity,
  StaffEntity,
  // [RFC 0001] Register YouthLeagueEntity so the MatchEntity → youthLeague
  // relation can resolve at metadata-build time. The simulator never
  // queries this table directly; this is purely so TypeORM can
  // introspect the relation without throwing at boot.
  YouthLeagueEntity,
  PlayerCompetitionStatsEntity,
} from '@goalxi/database';
import { SimulationProcessor } from './processor/simulation.processor';
import { NotificationModule } from './notification/notification.module';

const isDevelopmentFromEnv = () =>
  (process.env.NODE_ENV || 'development') === 'development';

const entities = [
  UserEntity,
  SessionEntity,
  TeamEntity,
  LeagueEntity,
  MatchEntity,
  MatchTacticsEntity,
  TacticsPresetEntity,
  MatchEventEntity,
  MatchTeamStatsEntity,
  SeasonResultEntity,
  LeagueStandingEntity,
  FinanceEntity,
  PlayerEntity,
  TransactionEntity,
  AuctionEntity,
  PlayerEventEntity,
  PlayerTransactionEntity,
  InjuryEntity,
  StaffEntity,
  // [RFC 0001] YouthLeagueEntity is referenced by MatchEntity.youthLeague.
  // We don't query it directly in the simulator, but TypeORM scans
  // every relation at boot — without this entry, the simulator
  // crashes with "Entity metadata for MatchEntity#youthLeague was not
  // found" before any code runs.
  YouthLeagueEntity,
  PlayerCompetitionStatsEntity,
];

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        type: 'postgres',
        host: configService.get('DATABASE_HOST'),
        port: configService.get('DATABASE_PORT'),
        username: configService.get('DATABASE_USERNAME'),
        password: configService.get('DATABASE_PASSWORD'),
        database: configService.get('DATABASE_NAME'),
        entities,
        synchronize: false,
      }),
    }),
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        connection: {
          host: configService.get('REDIS_HOST'),
          port: configService.get('REDIS_PORT'),
          password: configService.get('REDIS_PASSWORD'),
        },
      }),
    }),
    BullModule.registerQueue({
      name: 'match-simulation',
    }),
    TypeOrmModule.forFeature([
      MatchEntity,
      MatchEventEntity,
      MatchTacticsEntity,
      MatchTeamStatsEntity,
      PlayerEntity,
      TeamEntity,
      PlayerEventEntity,
      InjuryEntity,
      StaffEntity,
      YouthLeagueEntity,
      PlayerCompetitionStatsEntity,
    ]),
    NotificationModule,
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
      service: 'simulator',
      isDevelopment: isDevelopmentFromEnv(),
      file: './logs/simulator.log',
      maxSize: 100 * 1024 * 1024,
      maxFiles: 7,
    }),
  ],
  providers: [SimulationProcessor],
})
export class AppModule {}
