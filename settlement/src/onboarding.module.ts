import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TeamEntity } from '@goalxi/database';
import { OnboardingProcessor } from './processors/onboarding.processor';

/**
 * Subscribes the settlement worker to the
 * `onboarding-assignment` queue.
 *
 * BullMQ's writer (api) and reader (this worker) MUST agree on
 * the `prefix` — BullMQ writes Redis keys as
 * `<prefix>:<queue>:<...>`, and the worker's `bzpopmin` listens
 * on `<prefix>:<queue>:marker`. A prefix mismatch means the
 * job is written into a keyspace the worker never polls, and
 * the job sits in the `wait` list forever.
 *
 * The API registers the queue with `prefix: 'onboarding'` (see
 * `api/src/api/onboarding/onboarding.module.ts`); this module
 * mirrors that so the two services share one Redis keyspace.
 */
@Module({
  imports: [
    BullModule.registerQueue({
      // Bare queue name MUST match the `QueueName.ONBOARDING`
      // enum in the API (`api/src/constants/job.constant.ts`).
      name: 'onboarding-assignment',
      // MUST match the API's prefix. See the comment above
      // for the consequence of getting this wrong.
      prefix: 'onboarding',
    }),
    // We don't need the full team entity here, but TypeORM
    // requires the repository be registered with the module for
    // `dataSource.manager.getRepository(TeamEntity)` to work
    // inside the processor.
    TypeOrmModule.forFeature([TeamEntity]),
  ],
  providers: [OnboardingProcessor],
})
export class OnboardingModule {}
