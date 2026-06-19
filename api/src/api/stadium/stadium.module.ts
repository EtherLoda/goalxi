import {
  FinanceEntity,
  MatchEntity,
  StadiumConstructionEntity,
  StadiumEntity,
  TeamEntity,
  TransactionEntity,
} from '@goalxi/database';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FinanceModule } from '../finance/finance.module';
import { NotificationModule } from '../notification/notification.module';
import { StadiumConstructionService } from './stadium-construction.service';
import { StadiumController } from './stadium.controller';
import { StadiumService } from './stadium.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      StadiumEntity,
      StadiumConstructionEntity,
      TeamEntity,
      FinanceEntity,
      TransactionEntity,
      MatchEntity,
    ]),
    FinanceModule,
    NotificationModule,
  ],
  controllers: [StadiumController],
  providers: [StadiumService, StadiumConstructionService],
  exports: [StadiumService, StadiumConstructionService],
})
export class StadiumModule {}
