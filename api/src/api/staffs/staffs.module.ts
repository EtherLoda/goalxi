import {
  CoachPlayerAssignmentEntity,
  FinanceEntity,
  PlayerEntity,
  StaffEntity,
  TeamEntity,
} from '@goalxi/database';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { FinanceModule } from '../finance/finance.module';
import { StaffsController } from './staffs.controller';
import { StaffsService } from './staffs.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      StaffEntity,
      TeamEntity,
      FinanceEntity,
      CoachPlayerAssignmentEntity,
      PlayerEntity,
    ]),
    AuthModule,
    FinanceModule,
  ],
  controllers: [StaffsController],
  providers: [StaffsService],
  exports: [StaffsService],
})
export class StaffsModule {}
