import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MatchSimulationProcessor } from './match-simulation.processor';
import {
    MatchEntity,
    MatchEventEntity,
    MatchTeamStatsEntity,
    MatchTacticsEntity,
    PlayerEntity,
    TeamEntity,
} from '@goalxi/database';
import { SimulationService } from '../../../simulation/simulation.service';

@Module({
    imports: [
        BullModule.registerQueue({
            name: 'match-completion',
        }),
        TypeOrmModule.forFeature([
            MatchEntity,
            MatchEventEntity,
            MatchTeamStatsEntity,
            MatchTacticsEntity,
            PlayerEntity,
            TeamEntity,
        ]),
    ],
    providers: [MatchSimulationProcessor, SimulationService],
    exports: [MatchSimulationProcessor],
})
export class MatchSimulationQueueModule { }
