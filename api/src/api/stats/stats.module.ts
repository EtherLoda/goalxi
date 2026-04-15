import {
  MatchEntity,
  MatchTeamStatsEntity,
  PlayerCompetitionStatsEntity,
  PlayerEntity,
  TeamEntity,
} from '@goalxi/database';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { StatsController } from './stats.controller';
import { StatsService } from './stats.service';

@Module({
  imports: [
    AuthModule,
    TypeOrmModule.forFeature([
      MatchEntity,
      MatchTeamStatsEntity,
      TeamEntity,
      PlayerCompetitionStatsEntity,
      PlayerEntity,
    ]),
  ],
  controllers: [StatsController],
  providers: [StatsService],
  exports: [StatsService],
})
export class StatsModule {}
