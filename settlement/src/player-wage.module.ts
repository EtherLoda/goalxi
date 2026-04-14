import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PlayerEntity, TeamEntity } from '@goalxi/database';
import { PlayerWageProcessor } from './processors/player-wage.processor';

@Module({
  imports: [
    BullModule.registerQueue({
      name: 'player-wage',
    }),
    TypeOrmModule.forFeature([PlayerEntity, TeamEntity]),
  ],
  providers: [PlayerWageProcessor],
  exports: [BullModule],
})
export class PlayerWageModule {}
