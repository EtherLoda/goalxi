import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
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
  PlayerHistoryEntity,
  PlayerTransactionEntity,
  InjuryEntity,
  StaffEntity,
  YouthMatchEntity,
  YouthMatchEventEntity,
  YouthMatchTacticsEntity,
  YouthPlayerEntity,
  YouthTeamEntity,
  YouthLeagueEntity,
} from '@goalxi/database';
import { SimulationProcessor } from './processor/simulation.processor';
import { YouthSimulationProcessor } from './processor/youth-simulation.processor';

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
  PlayerHistoryEntity,
  PlayerTransactionEntity,
  InjuryEntity,
  YouthMatchEntity,
  YouthMatchEventEntity,
  YouthMatchTacticsEntity,
  YouthPlayerEntity,
  YouthTeamEntity,
  YouthLeagueEntity,
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
    BullModule.registerQueue({
      name: 'youth-match-simulation',
    }),
    TypeOrmModule.forFeature([
      MatchEntity,
      MatchEventEntity,
      MatchTacticsEntity,
      MatchTeamStatsEntity,
      PlayerEntity,
      TeamEntity,
      InjuryEntity,
      StaffEntity,
      YouthMatchEntity,
      YouthMatchEventEntity,
      YouthMatchTacticsEntity,
      YouthPlayerEntity,
      YouthTeamEntity,
    ]),
  ],
  providers: [SimulationProcessor, YouthSimulationProcessor],
})
export class AppModule { }
