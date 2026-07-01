import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  CoachPlayerAssignmentEntity,
  PlayerEntity,
  StaffEntity,
} from '@goalxi/database';
import { YouthProgressionProcessor } from './processors/youth-progression.processor';

@Module({
  imports: [
    BullModule.registerQueue({
      name: 'youth-progression-settlement',
    }),
    TypeOrmModule.forFeature([
      PlayerEntity,
      StaffEntity,
      CoachPlayerAssignmentEntity,
    ]),
  ],
  providers: [YouthProgressionProcessor],
  exports: [BullModule],
})
export class YouthProgressionModule {}
