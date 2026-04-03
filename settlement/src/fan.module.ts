import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FanEntity, TeamEntity, LeagueEntity } from '@goalxi/database';
import { FanProcessor } from './processors/fan.processor';

@Module({
  imports: [
    BullModule.registerQueue({
      name: 'fan-settlement',
    }),
    TypeOrmModule.forFeature([FanEntity, TeamEntity, LeagueEntity]),
  ],
  providers: [FanProcessor],
  exports: [BullModule],
})
export class FanModule {}
