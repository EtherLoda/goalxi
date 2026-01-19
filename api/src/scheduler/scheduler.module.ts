import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { BullModule } from '@nestjs/bullmq';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MatchEntity, MatchTacticsEntity, MatchEventEntity, PlayerEntity, InjuryEntity } from '@goalxi/database';
import { MatchSchedulerService } from './match-scheduler.service';
import { InjuryRecoveryService } from './injury-recovery.service';

@Module({
    imports: [
        ScheduleModule.forRoot(),
        BullModule.registerQueue({
            name: 'match-simulation',
        }),
        BullModule.registerQueue({
            name: 'match-completion',
        }),
        TypeOrmModule.forFeature([MatchEntity, MatchTacticsEntity, MatchEventEntity, PlayerEntity, InjuryEntity]),
    ],
    providers: [MatchSchedulerService, InjuryRecoveryService],
    exports: [MatchSchedulerService, InjuryRecoveryService],
})
export class SchedulerModule { }
