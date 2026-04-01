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
  StadiumEntity,
  FanEntity,
  LeagueStandingEntity,
} from '@goalxi/database';
import { MatchController } from './match.controller';
import { MatchService } from './match.service';
import { PresetService } from './preset.service';
import { MatchEventService } from './match-event.service';
import { MatchCacheService } from './match-cache.service';
import { MatchCompletionService } from './match-completion.service';
import { AuthModule } from '../auth/auth.module';
import { FanModule } from '../fan/fan.module';
import { FinanceModule } from '../finance/finance.module';

@Module({
  imports: [
    AuthModule,
    FanModule,
    FinanceModule,
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
      StadiumEntity,
      FanEntity,
      LeagueStandingEntity,
    ]),
  ],
  controllers: [MatchController],
  providers: [MatchService, PresetService, MatchEventService, MatchCacheService, MatchCompletionService],
  exports: [MatchService, PresetService, MatchCacheService, MatchCompletionService],
})
export class MatchModule { }
