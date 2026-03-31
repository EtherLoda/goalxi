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
} from '@goalxi/database';
import { SimulationProcessor } from './processor/simulation.processor';

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
];
// 顺带把 PlayerTransactionEntity 从 forFeature 里去掉（processor 没用它）

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
      InjuryEntity,
      StaffEntity,
    ]),
  ],
  providers: [SimulationProcessor],
})
export class AppModule { }
