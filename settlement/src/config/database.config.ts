import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmOptionsFactory, TypeOrmModuleOptions } from '@nestjs/typeorm';
import {
  PlayerEntity,
  TeamEntity,
  UserEntity,
  LeagueEntity,
  MatchEntity,
  MatchEventEntity,
  MatchTacticsEntity,
  MatchTeamStatsEntity,
  StadiumEntity,
  StadiumConstructionEntity,
  FanEntity,
  FinanceEntity,
  TransactionEntity,
  SeasonResultEntity,
  LeagueStandingEntity,
  StaffEntity,
  InjuryEntity,
  AuctionEntity,
  PlayerEventEntity,
  PlayerTransactionEntity,
  TacticsPresetEntity,
  YouthLeagueEntity,
  YouthTeamEntity,
  
  
  
  
  WeatherEntity,
  SessionEntity,
  TransferTransactionEntity,
  PlayerCompetitionStatsEntity,
  ArchivedSeasonResultEntity,
  ArchivedPlayerCompetitionStatsEntity,
  ArchivedTransactionEntity,
  ArchivedPlayerEventEntity,
  ForumCategoryEntity,
  ForumThreadEntity,
  ForumPostEntity,
  ForumReactionEntity,
} from '@goalxi/database';

@Injectable()
export class DatabaseConfigService implements TypeOrmOptionsFactory {
  constructor(private readonly configService: ConfigService) {}

  createTypeOrmOptions(): TypeOrmModuleOptions {
    return {
      type: 'postgres',
      host: this.configService.getOrThrow('DATABASE_HOST', { infer: true }),
      port: this.configService.getOrThrow<number>('DATABASE_PORT', {
        infer: true,
      }),
      username: this.configService.getOrThrow('DATABASE_USERNAME', {
        infer: true,
      }),
      password: this.configService.getOrThrow('DATABASE_PASSWORD', {
        infer: true,
      }),
      database: this.configService.getOrThrow('DATABASE_NAME', { infer: true }),
      entities: [
        PlayerEntity,
        TeamEntity,
        UserEntity,
        LeagueEntity,
        MatchEntity,
        MatchEventEntity,
        MatchTacticsEntity,
        MatchTeamStatsEntity,
        StadiumEntity,
        StadiumConstructionEntity,
        FanEntity,
        FinanceEntity,
        TransactionEntity,
        SeasonResultEntity,
        LeagueStandingEntity,
        StaffEntity,
        InjuryEntity,
        AuctionEntity,
        PlayerEventEntity,
        PlayerTransactionEntity,
        TacticsPresetEntity,
        YouthLeagueEntity,
        YouthTeamEntity,
        
        
        
        
        WeatherEntity,
        SessionEntity,
        TransferTransactionEntity,
        PlayerCompetitionStatsEntity,
        ArchivedSeasonResultEntity,
        ArchivedPlayerCompetitionStatsEntity,
        ArchivedTransactionEntity,
        ArchivedPlayerEventEntity,
        ForumCategoryEntity,
        ForumThreadEntity,
        ForumPostEntity,
        ForumReactionEntity,
      ],
      synchronize: process.env.DATABASE_SYNCHRONIZE === 'true',
    };
  }
}
