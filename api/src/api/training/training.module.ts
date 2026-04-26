import {
  CoachPlayerAssignmentEntity,
  PlayerEntity,
  StaffEntity,
  TeamEntity,
  TrainingUpdateEntity,
} from '@goalxi/database';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { StaffsModule } from '../staffs/staffs.module';
import { TrainingController } from './training.controller';
import { TrainingService } from './training.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      PlayerEntity,
      StaffEntity,
      TeamEntity,
      CoachPlayerAssignmentEntity,
      TrainingUpdateEntity,
    ]),
    StaffsModule,
    AuthModule,
  ],
  controllers: [TrainingController],
  providers: [TrainingService],
  exports: [TrainingService],
})
export class TrainingModule {}
