import { Module } from '@nestjs/common';
import { CacheModule } from '@nestjs/cache-manager';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
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
import { MatchCacheService } from './match-cache.service';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    AuthModule,
    CacheModule.register(),
    BullModule.registerQueue({
      name: 'match-simulation',
    }),
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
  providers: [MatchService, PresetService, MatchEventService, MatchCacheService],
  exports: [MatchService, PresetService, MatchCacheService],
})
export class MatchModule { }
