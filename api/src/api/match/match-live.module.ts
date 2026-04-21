import { MatchEntity, MatchEventEntity } from '@goalxi/database';
import { Module, forwardRef } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { MatchLiveGateway } from './match-live.gateway';
import { MatchLiveScheduler } from './match-live.scheduler';
import { MatchModule } from './match.module';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    TypeOrmModule.forFeature([MatchEntity, MatchEventEntity]),
    forwardRef(() => AuthModule),
    forwardRef(() => MatchModule),
  ],
  providers: [MatchLiveGateway, MatchLiveScheduler],
  exports: [MatchLiveGateway],
})
export class MatchLiveModule {}
