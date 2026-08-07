import { QueueName, QueuePrefix } from '@/constants/job.constant';
import { TeamEntity, UserEntity } from '@goalxi/database';
import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OnboardingController } from './onboarding.controller';
import { OnboardingService } from './onboarding.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([UserEntity, TeamEntity]),
    // The same queue is consumed by the settlement worker. We
    // register it here so the API can enqueue jobs and so the
    // service can call `getJob` for the dedup check without
    // pulling in another module.
    BullModule.registerQueue({
      name: QueueName.ONBOARDING,
      prefix: QueuePrefix.ONBOARDING,
    }),
  ],
  controllers: [OnboardingController],
  providers: [OnboardingService],
  exports: [OnboardingService],
})
export class OnboardingModule {}
