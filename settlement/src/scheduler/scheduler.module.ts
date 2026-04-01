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
    WeatherEntity,
    TacticsPresetEntity,
} from '@goalxi/database';
import { WeatherSchedulerService } from './weather-scheduler.service';
import { WeatherService } from './weather.service';
import { InjuryRecoveryService } from './injury-recovery.service';
import { TrainingSchedulerService } from './training-scheduler.service';
import { MatchSchedulerService } from './match-scheduler.service';
import { YouthMatchSchedulerService } from './youth-match-scheduler.service';
import { SeasonSchedulerService } from './season-scheduler.service';
import { YouthSeasonSchedulerService } from './youth-season-scheduler.service';
import { PromotionRelegationService } from './promotion-relegation.service';
import { PlayoffService } from './playoff.service';
import { LeagueAdminService } from './league-admin.service';
import { TeamGeneratorService } from './team-generator.service';
import { ScoutSchedulerService } from './scout-scheduler.service';

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
        TypeOrmModule.forFeature([
            MatchEntity, MatchTacticsEntity, MatchEventEntity,
            PlayerEntity, InjuryEntity,
            YouthPlayerEntity, YouthLeagueEntity, YouthTeamEntity,
            YouthMatchEntity, YouthMatchEventEntity, YouthMatchTacticsEntity,
            TeamEntity, ScoutCandidateEntity, StaffEntity,
            LeagueEntity, LeagueStandingEntity, SeasonResultEntity,
            StadiumEntity, FanEntity, WeatherEntity,
            TacticsPresetEntity,
        ]),
    ],
    providers: [
        WeatherSchedulerService,
        WeatherService,
        InjuryRecoveryService,
        TrainingSchedulerService,
        MatchSchedulerService,
        YouthMatchSchedulerService,
        SeasonSchedulerService,
        YouthSeasonSchedulerService,
        PromotionRelegationService,
        PlayoffService,
        LeagueAdminService,
        TeamGeneratorService,
        ScoutSchedulerService,
    ],
    exports: [
        WeatherSchedulerService,
        WeatherService,
        InjuryRecoveryService,
        TrainingSchedulerService,
        MatchSchedulerService,
        YouthMatchSchedulerService,
        SeasonSchedulerService,
        YouthSeasonSchedulerService,
        PromotionRelegationService,
        PlayoffService,
        LeagueAdminService,
        TeamGeneratorService,
        ScoutSchedulerService,
    ],
})
export class SchedulerModule { }
