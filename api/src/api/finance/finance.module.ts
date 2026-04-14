import {
  FanEntity,
  FinanceEntity,
  PlayerEntity,
  StadiumEntity,
  StaffEntity,
  TeamEntity,
  TransactionEntity,
} from '@goalxi/database';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { FinanceController } from './finance.controller';
import { FinanceService } from './finance.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      FinanceEntity,
      TransactionEntity,
      TeamEntity,
      FanEntity,
      StadiumEntity,
      StaffEntity,
      PlayerEntity,
    ]),
    AuthModule,
  ],
  controllers: [FinanceController],
  providers: [FinanceService],
  exports: [FinanceService],
})
export class FinanceModule {}
