import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  MatchEntity,
  MatchTacticsEntity,
  TacticsPresetEntity,
  TeamEntity,
  PlayerEntity,
  LeagueEntity,
  MatchEventEntity,
  MatchTeamStatsEntity,
} from '@goalxi/database';
import { MatchController } from './match.controller';
import { MatchService } from './match.service';
import { PresetService } from './preset.service';
import { MatchEventService } from './match-event.service';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    AuthModule,
    TypeOrmModule.forFeature([
      MatchEntity,
      MatchTacticsEntity,
      TacticsPresetEntity,
      TeamEntity,
      PlayerEntity,
      LeagueEntity,
      MatchEventEntity,
      MatchTeamStatsEntity,
    ]),
  ],
  controllers: [MatchController],
  providers: [MatchService, PresetService, MatchEventService],
  exports: [MatchService, PresetService],
})
export class MatchModule { }
