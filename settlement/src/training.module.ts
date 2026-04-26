import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  PlayerEntity,
  StaffEntity,
  TeamEntity,
  CoachPlayerAssignmentEntity,
  TrainingUpdateEntity,
} from '@goalxi/database';
import { TrainingProcessor } from './processors/training.processor';
import { NotificationModule } from './notification/notification.module';

@Module({
  imports: [
    BullModule.registerQueue({
      name: 'training-settlement',
    }),
    TypeOrmModule.forFeature([
      PlayerEntity,
      StaffEntity,
      TeamEntity,
      CoachPlayerAssignmentEntity,
      TrainingUpdateEntity,
    ]),
    NotificationModule,
  ],
  providers: [TrainingProcessor],
  exports: [BullModule],
})
export class TrainingModule {}
