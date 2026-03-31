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
    TeamEntity,
    ScoutCandidateEntity,
    StaffEntity,
} from '@goalxi/database';
import { MatchSchedulerService } from './match-scheduler.service';
import { InjuryRecoveryService } from './injury-recovery.service';
import { ScoutSchedulerService } from './scout-scheduler.service';
import { TrainingSchedulerService } from './training-scheduler.service';

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
        TypeOrmModule.forFeature([
            MatchEntity, MatchTacticsEntity, MatchEventEntity,
            PlayerEntity, InjuryEntity, YouthPlayerEntity,
            TeamEntity, ScoutCandidateEntity, StaffEntity,
        ]),
    ],
    providers: [
        MatchSchedulerService,
        InjuryRecoveryService,
        ScoutSchedulerService,
        TrainingSchedulerService,
    ],
    exports: [
        MatchSchedulerService,
        InjuryRecoveryService,
        ScoutSchedulerService,
        TrainingSchedulerService,
    ],
})
export class SchedulerModule { }
