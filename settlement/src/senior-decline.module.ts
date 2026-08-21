import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PlayerEntity } from '@goalxi/database';
import { PlayerDeclineProcessor } from './processors/player-decline.processor';

/**
 * Senior-decline module.
 *
 * Mirrors the structure of `YouthProgressionModule`: a single queue
 * + a single processor, no scheduler (the cron lives in
 * `SchedulerModule` next to the other schedulers).
 *
 * The processor reads `PlayerEntity` and writes back mutated
 * `currentSkills`; it does not touch the transfer market, the
 * training pipeline, or any other entity. We register only the
 * entity the processor actually uses to keep the module small.
 */
@Module({
  imports: [
    BullModule.registerQueue({
      name: 'senior-decline-settlement',
    }),
    TypeOrmModule.forFeature([PlayerEntity]),
  ],
  providers: [PlayerDeclineProcessor],
  exports: [BullModule],
})
export class SeniorDeclineModule {}
