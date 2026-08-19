import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmOptionsFactory, TypeOrmModuleOptions } from '@nestjs/typeorm';
import {
  AnnouncementEntity,
  CupBracketSlotEntity,
  CupEntity,
  CupEntryEntity,
  CupRoundEntity,
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
  ScoutCandidateEntity,
  SystemConfigEntity,
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
        AnnouncementEntity,
        CupEntity,
        // Cup*Entity trio: registered here so every submodule
        // that does `TypeOrmModule.forFeature([CupRoundEntity])`
        // / `CupBracketSlotEntity` / `CupEntryEntity` finds the
        // metadata. Without this entry the DI returns a working
        // Repository<T> but the first `repo.find()` throws
        // `No metadata for "XxxEntity" was found.` The cup
        // scheduler ticks every minute, so the error logs once
        // a minute until the missing entries are added below.
        CupRoundEntity,
        CupBracketSlotEntity,
        CupEntryEntity,
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
        ScoutCandidateEntity,

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
        SystemConfigEntity,
      ],
      synchronize: process.env.DATABASE_SYNCHRONIZE === 'true',
      // Mirror the API service: 20×3s covers standard RDS failovers
      // (30-60s) without crashing the BullMQ worker mid-job. The
      // settlement process is a long-lived background runner — a
      // hard crash loses every in-flight retry queue, while a
      // bounded retry just delays the first poll.
      retryAttempts: 20,
      retryDelay: 3000,
    };
  }
}
