import {
  FinanceEntity,
  MatchEntity,
  StadiumEntity,
  TransactionEntity,
} from '@goalxi/database';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FinanceModule } from '../finance/finance.module';
import { StadiumController } from './stadium.controller';
import { StadiumService } from './stadium.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      StadiumEntity,
      FinanceEntity,
      TransactionEntity,
      MatchEntity,
    ]),
    FinanceModule,
  ],
  controllers: [StadiumController],
  providers: [StadiumService],
  exports: [StadiumService],
})
export class StadiumModule {}
