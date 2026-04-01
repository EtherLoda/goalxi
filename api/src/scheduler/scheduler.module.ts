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
} from '@goalxi/database';
import { MatchSchedulerService } from './match-scheduler.service';
import { InjuryRecoveryService } from './injury-recovery.service';
import { ScoutSchedulerService } from './scout-scheduler.service';
import { TrainingSchedulerService } from './training-scheduler.service';
import { SeasonSchedulerService } from './season-scheduler.service';
import { YouthSeasonSchedulerService } from './youth-season-scheduler.service';
import { YouthMatchSchedulerService } from './youth-match-scheduler.service';
import { PromotionRelegationService } from './promotion-relegation.service';
import { PlayoffService } from './playoff.service';
import { LeagueAdminService } from './league-admin.service';
import { TeamGeneratorService } from './team-generator.service';

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
            StadiumEntity, FanEntity,
        ]),
    ],
    providers: [
        MatchSchedulerService,
        InjuryRecoveryService,
        ScoutSchedulerService,
        TrainingSchedulerService,
        SeasonSchedulerService,
        YouthSeasonSchedulerService,
        YouthMatchSchedulerService,
        PromotionRelegationService,
        PlayoffService,
        LeagueAdminService,
        TeamGeneratorService,
    ],
    exports: [
        MatchSchedulerService,
        InjuryRecoveryService,
        ScoutSchedulerService,
        TrainingSchedulerService,
        SeasonSchedulerService,
        YouthSeasonSchedulerService,
        YouthMatchSchedulerService,
        PromotionRelegationService,
        PlayoffService,
        LeagueAdminService,
        TeamGeneratorService,
    ],
})
export class SchedulerModule { }
