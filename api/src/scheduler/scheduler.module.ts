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
} from '@goalxi/database';
import { MatchSchedulerService } from './match-scheduler.service';
import { InjuryRecoveryService } from './injury-recovery.service';
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
        TypeOrmModule.forFeature([
            MatchEntity, MatchTacticsEntity, MatchEventEntity,
            PlayerEntity, InjuryEntity, YouthPlayerEntity,
            TeamEntity, ScoutCandidateEntity,
        ]),
    ],
    providers: [MatchSchedulerService, InjuryRecoveryService, ScoutSchedulerService],
    exports: [MatchSchedulerService, InjuryRecoveryService, ScoutSchedulerService],
})
export class SchedulerModule { }
