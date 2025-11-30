import { AuthModule } from '../auth/auth.module';
import { FinanceController } from './finance.controller';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FinanceEntity, TransactionEntity } from '@goalxi/database';
import { FinanceService } from './finance.service';

@Module({
    imports: [
        TypeOrmModule.forFeature([FinanceEntity, TransactionEntity]),
        AuthModule,
    ],
    controllers: [FinanceController],
    providers: [FinanceService],
    exports: [FinanceService],
})
export class FinanceModule { }
