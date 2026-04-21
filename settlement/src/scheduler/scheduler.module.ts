import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { BullModule } from '@nestjs/bullmq';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  MatchEntity,
  MatchTacticsEntity,
  MatchEventEntity,
  PlayerEntity,
  InjuryEntity,
  YouthPlayerEntity,
  YouthLeagueEntity,
  YouthTeamEntity,
  YouthMatchEntity,
  YouthMatchEventEntity,
  YouthMatchTacticsEntity,
  TeamEntity,
  ScoutCandidateEntity,
  StaffEntity,
  LeagueEntity,
  LeagueStandingEntity,
  SeasonResultEntity,
  StadiumEntity,
  FanEntity,
  FinanceEntity,
  WeatherEntity,
  TacticsPresetEntity,
  PlayerCompetitionStatsEntity,
  PlayerEventEntity,
  TransactionEntity,
  ArchivedSeasonResultEntity,
  ArchivedPlayerCompetitionStatsEntity,
  ArchivedTransactionEntity,
  ArchivedPlayerEventEntity,
} from '@goalxi/database';
import { LeagueAwardService } from './league-award.service';
import { WeatherSchedulerService } from './weather-scheduler.service';
import { WeatherService } from './weather.service';
import { InjuryRecoveryService } from './injury-recovery.service';
import { WeeklySettlementService } from './weekly-settlement.service';
import { MatchSchedulerService } from './match-scheduler.service';
import { YouthMatchSchedulerService } from './youth-match-scheduler.service';
import { SeasonSchedulerService } from './season-scheduler.service';
import { YouthSeasonSchedulerService } from './youth-season-scheduler.service';
import { PromotionRelegationService } from './promotion-relegation.service';
import { PlayoffService } from './playoff.service';
import { LeagueAdminService } from './league-admin.service';
import { TeamGeneratorService } from './team-generator.service';
import { ScoutSchedulerService } from './scout-scheduler.service';
import { FinanceSchedulerService } from './finance-scheduler.service';
import { PlayerWageSchedulerService } from './player-wage-scheduler.service';
import { LeagueStandingService } from './league-standing.service';
import { SeasonTransitionService } from './season-transition.service';
import { SeasonArchiveService } from '../services/season-archive.service';
import { NotificationModule } from '../notification/notification.module';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    BullModule.registerQueue({
      name: 'match-simulation',
    }),
    BullModule.registerQueue({
      name: 'match-completion',
    }),
    BullModule.registerQueue({
      name: 'training-settlement',
    }),
    BullModule.registerQueue({
      name: 'youth-match-simulation',
    }),
    BullModule.registerQueue({
      name: 'finance-settlement',
    }),
    BullModule.registerQueue({
      name: 'player-wage',
    }),
    BullModule.registerQueue({
      name: 'condition-settlement',
    }),
    TypeOrmModule.forFeature([
      MatchEntity,
      MatchTacticsEntity,
      MatchEventEntity,
      PlayerEntity,
      InjuryEntity,
      YouthPlayerEntity,
      YouthLeagueEntity,
      YouthTeamEntity,
      YouthMatchEntity,
      YouthMatchEventEntity,
      YouthMatchTacticsEntity,
      TeamEntity,
      ScoutCandidateEntity,
      StaffEntity,
      LeagueEntity,
      LeagueStandingEntity,
      SeasonResultEntity,
      StadiumEntity,
      FanEntity,
      FinanceEntity,
      WeatherEntity,
      TacticsPresetEntity,
      PlayerCompetitionStatsEntity,
      PlayerEventEntity,
      TransactionEntity,
      ArchivedSeasonResultEntity,
      ArchivedPlayerCompetitionStatsEntity,
      ArchivedTransactionEntity,
      ArchivedPlayerEventEntity,
    ]),
    NotificationModule,
  ],
  providers: [
    LeagueAwardService,
    WeatherSchedulerService,
    WeatherService,
    InjuryRecoveryService,
    WeeklySettlementService,
    MatchSchedulerService,
    YouthMatchSchedulerService,
    SeasonSchedulerService,
    YouthSeasonSchedulerService,
    PromotionRelegationService,
    PlayoffService,
    LeagueAdminService,
    TeamGeneratorService,
    ScoutSchedulerService,
    FinanceSchedulerService,
    PlayerWageSchedulerService,
    LeagueStandingService,
    SeasonTransitionService,
    SeasonArchiveService,
  ],
  exports: [
    LeagueAwardService,
    WeatherSchedulerService,
    WeatherService,
    InjuryRecoveryService,
    WeeklySettlementService,
    MatchSchedulerService,
    YouthMatchSchedulerService,
    SeasonSchedulerService,
    YouthSeasonSchedulerService,
    PromotionRelegationService,
    PlayoffService,
    LeagueAdminService,
    TeamGeneratorService,
    ScoutSchedulerService,
    FinanceSchedulerService,
    PlayerWageSchedulerService,
    LeagueStandingService,
    SeasonTransitionService,
    SeasonArchiveService,
  ],
})
export class SchedulerModule {}
