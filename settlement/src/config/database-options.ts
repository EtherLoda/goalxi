import {
  AuctionEntity,
  FanEntity,
  FinanceEntity,
  ForumCategoryEntity,
  ForumPostEntity,
  ForumReactionEntity,
  ForumThreadEntity,
  InjuryEntity,
  LeagueEntity,
  LeagueStandingEntity,
  MatchEntity,
  MatchEventEntity,
  MatchTacticsEntity,
  MatchTeamStatsEntity,
  PlayerEntity,
  PlayerEventEntity,
  PlayerTransactionEntity,
  ScoutCandidateEntity,
  SeasonResultEntity,
  SessionEntity,
  StaffEntity,
  StadiumConstructionEntity,
  StadiumEntity,
  SystemConfigEntity,
  TacticsPresetEntity,
  TeamEntity,
  TransactionEntity,
  TransferTransactionEntity,
  UserEntity,
  WeatherEntity,
  YouthLeagueEntity,
  YouthTeamEntity,
  AnnouncementEntity,
  TrainingUpdateEntity,
  CoachPlayerAssignmentEntity,
  PlayerCompetitionStatsEntity,
  ArchivedPlayerCompetitionStatsEntity,
  ArchivedPlayerEventEntity,
  ArchivedSeasonResultEntity,
  ArchivedTransactionEntity,
} from '@goalxi/database';
import { TypeOrmModuleOptions } from '@nestjs/typeorm';

/**
 * Plain-object Postgres config used by the standalone
 * `scripts/init.ts` CLI. Mirrors
 * `DatabaseConfigService.createTypeOrmOptions()` so the
 * CLI hits the same DB / entity set the running service
 * uses, without dragging in the Nest DI container.
 *
 * Reads from `process.env`. Production deploys are
 * expected to have all five `DATABASE_*` vars set; the
 * dev fallback matches the `seed-main` defaults so
 * `pnpm init:run` Just Works on a fresh checkout.
 */
export class DatabaseOptions {
  static build(): TypeOrmModuleOptions {
    return {
      type: 'postgres',
      host: process.env.DATABASE_HOST ?? 'localhost',
      port: process.env.DATABASE_PORT
        ? parseInt(process.env.DATABASE_PORT, 10)
        : 5432,
      username: process.env.DATABASE_USERNAME ?? 'postgres',
      password: process.env.DATABASE_PASSWORD ?? 'postgres',
      database: process.env.DATABASE_NAME ?? 'goalxi',
      synchronize: false,
      entities: [
        UserEntity,
        SessionEntity,
        StaffEntity,
        TeamEntity,
        LeagueEntity,
        MatchEntity,
        MatchEventEntity,
        MatchTacticsEntity,
        MatchTeamStatsEntity,
        SeasonResultEntity,
        LeagueStandingEntity,
        FinanceEntity,
        PlayerEntity,
        TransactionEntity,
        AuctionEntity,
        PlayerEventEntity,
        PlayerTransactionEntity,
        StadiumEntity,
        StadiumConstructionEntity,
        FanEntity,
        YouthLeagueEntity,
        YouthTeamEntity,
        ScoutCandidateEntity,
        WeatherEntity,
        SystemConfigEntity,
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
        AnnouncementEntity,
        TrainingUpdateEntity,
        CoachPlayerAssignmentEntity,
        InjuryEntity,
        TacticsPresetEntity,
      ],
    };
  }
}
