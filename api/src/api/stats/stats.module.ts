import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
    MatchEntity,
    MatchTeamStatsEntity,
    TeamEntity,
} from '@goalxi/database';
import { StatsController } from './stats.controller';
import { StatsService } from './stats.service';

@Module({
    imports: [
        TypeOrmModule.forFeature([
            MatchEntity,
            MatchTeamStatsEntity,
            TeamEntity,
        ]),
    ],
    controllers: [StatsController],
    providers: [StatsService],
    exports: [StatsService],
})
export class StatsModule { }
