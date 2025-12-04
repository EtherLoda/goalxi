import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { BullModule } from '@nestjs/bullmq';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MatchEntity, MatchTacticsEntity } from '@goalxi/database';
import { MatchSchedulerService } from './match-scheduler.service';

@Module({
    imports: [
        ScheduleModule.forRoot(),
        BullModule.registerQueue({
            name: 'match-simulation',
        }),
        TypeOrmModule.forFeature([MatchEntity, MatchTacticsEntity]),
    ],
    providers: [MatchSchedulerService],
    exports: [MatchSchedulerService],
})
export class SchedulerModule { }
