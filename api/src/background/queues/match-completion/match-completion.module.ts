import { MatchCacheService } from '@/api/match/match-cache.service';
import { MatchCompletionService } from '@/api/match/match-completion.service';
import {
  FanEntity,
  InjuryEntity,
  LeagueStandingEntity,
  MatchEntity,
  MatchEventEntity,
  MatchTacticsEntity,
  PlayerEntity,
  StadiumEntity,
  TeamEntity,
} from '@goalxi/database';
import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FanModule } from '../../../api/fan/fan.module';
import { FinanceModule } from '../../../api/finance/finance.module';
import { MatchCompletionProcessor } from './match-completion.processor';

@Module({
  imports: [
    BullModule.registerQueue({
      name: 'match-completion',
    }),
    TypeOrmModule.forFeature([
      MatchEntity,
      LeagueStandingEntity,
      PlayerEntity,
      MatchEventEntity,
      MatchTacticsEntity,
      TeamEntity,
      StadiumEntity,
      FanEntity,
      InjuryEntity,
    ]),
    FanModule,
    FinanceModule,
  ],
  providers: [
    MatchCompletionProcessor,
    MatchCompletionService,
    MatchCacheService,
  ],
  exports: [BullModule],
})
export class MatchCompletionModule {}
