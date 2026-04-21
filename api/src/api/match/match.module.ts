import {
  FanEntity,
  InjuryEntity,
  LeagueEntity,
  LeagueStandingEntity,
  MatchEntity,
  MatchEventEntity,
  MatchTacticsEntity,
  MatchTeamStatsEntity,
  PlayerEntity,
  StadiumEntity,
  TacticsPresetEntity,
  TeamEntity,
} from '@goalxi/database';
import { BullModule } from '@nestjs/bullmq';
import { CacheModule } from '@nestjs/cache-manager';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { FanModule } from '../fan/fan.module';
import { FinanceModule } from '../finance/finance.module';
import { MatchCacheService } from './match-cache.service';
import { MatchCompletionService } from './match-completion.service';
import { MatchEventService } from './match-event.service';
import { MatchController } from './match.controller';
import { MatchService } from './match.service';
import { PresetService } from './preset.service';

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
      InjuryEntity,
    ]),
  ],
  controllers: [MatchController],
  providers: [
    MatchService,
    PresetService,
    MatchEventService,
    MatchCacheService,
    MatchCompletionService,
  ],
  exports: [
    MatchService,
    MatchEventService,
    PresetService,
    MatchCacheService,
    MatchCompletionService,
  ],
})
export class MatchModule {}
