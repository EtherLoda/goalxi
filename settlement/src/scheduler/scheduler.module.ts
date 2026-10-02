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
  CupEntity,
  CupRoundEntity,
  CupBracketSlotEntity,
} from '@goalxi/database';
import { LeagueAwardService } from './league-award.service';
import { WeatherSchedulerService } from './weather-scheduler.service';
import { WeatherService } from './weather.service';
import { InjuryRecoveryService } from './injury-recovery.service';
import { WeeklySettlementService } from './weekly-settlement.service';
import { MatchSchedulerService } from './match-scheduler.service';
import { CupSchedulerService } from './cup-scheduler.service';

import { SeasonSchedulerService } from './season-scheduler.service';

import { PromotionRelegationService } from './promotion-relegation.service';
import { PlayoffService } from './playoff.service';
import { TeamGeneratorService } from './team-generator.service';
import { ScoutSchedulerService } from './scout-scheduler.service';
import { FinanceSchedulerService } from './finance-scheduler.service';
import { PlayerWageSchedulerService } from './player-wage-scheduler.service';
import { SeniorDeclineSchedulerService } from './senior-decline-scheduler.service';
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
    // Cup bracket closeout. Deliberately a SEPARATE queue from
    // `match-completion`: the API's league completion worker also
    // consumes `match-completion`, and two BullMQ workers on one
    // queue compete rather than broadcast — sharing it meant roughly
    // half of all matches were either bracket-advanced-without-
    // settlement or settled-without-bracket-advance. Produced by
    // `MatchSchedulerService.completeMatches` for CUP matches only;
    // consumed by `CupProgressProcessor` (registered in `CupModule`).
    BullModule.registerQueue({
      name: 'cup-progress',
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
    BullModule.registerQueue({
      name: 'construction-settlement',
    }),
    BullModule.registerQueue({
      name: 'youth-progression-settlement',
    }),
    BullModule.registerQueue({
      name: 'senior-decline-settlement',
    }),
    BullModule.registerQueue({
      name: 'fan-settlement',
    }),
    TypeOrmModule.forFeature([
      MatchEntity,
      MatchTacticsEntity,
      MatchEventEntity,
      PlayerEntity,
      InjuryEntity,

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
      CupEntity,
      CupRoundEntity,
      CupBracketSlotEntity,
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
    CupSchedulerService,

    SeasonSchedulerService,

    PromotionRelegationService,
    PlayoffService,
    TeamGeneratorService,
    ScoutSchedulerService,
    FinanceSchedulerService,
    PlayerWageSchedulerService,
    SeniorDeclineSchedulerService,
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
    CupSchedulerService,

    SeasonSchedulerService,

    PromotionRelegationService,
    PlayoffService,
    TeamGeneratorService,
    ScoutSchedulerService,
    FinanceSchedulerService,
    PlayerWageSchedulerService,
    SeniorDeclineSchedulerService,
    LeagueStandingService,
    SeasonTransitionService,
    SeasonArchiveService,
  ],
})
export class SchedulerModule {}
