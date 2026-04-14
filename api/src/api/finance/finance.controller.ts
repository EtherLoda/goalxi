import { Uuid } from '@/common/types/common.type';
import { CurrentUser } from '@/decorators/current-user.decorator';
import { AuthGuard } from '@/guards/auth.guard';
import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { plainToInstance } from 'class-transformer';
import { TransactionResDto } from './dto/transaction.res.dto';
import { TransactionType } from './finance.constants';
import { FinanceService } from './finance.service';

@Controller({
  path: 'finance',
  version: '1',
})
@ApiTags('Finance')
@ApiBearerAuth()
@UseGuards(AuthGuard)
export class FinanceController {
  constructor(private readonly financeService: FinanceService) {}

  @Get('balance')
  @ApiOperation({ summary: 'Get current team balance' })
  async getBalance(@CurrentUser('id') userId: Uuid) {
    return this.financeService.getBalanceByUserId(userId);
  }

  @Get('transactions')
  @ApiOperation({ summary: 'Get transaction history' })
  @ApiQuery({ name: 'season', required: false, type: Number })
  @ApiQuery({ name: 'type', required: false, enum: TransactionType })
  async getTransactions(
    @CurrentUser('id') userId: Uuid,
    @Query('season') season?: number,
    @Query('type') type?: TransactionType,
  ): Promise<TransactionResDto[]> {
    const transactions = await this.financeService.getTransactionsByUserId(
      userId,
      season,
      type,
    );
    return transactions.map((tx) => plainToInstance(TransactionResDto, tx));
  }
}
