import { FinanceService } from '@/api/finance/finance.service';
import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { Job } from 'bullmq';

@Injectable()
@Processor('finance-settlement')
export class FinanceSettlementProcessor extends WorkerHost {
  private readonly logger = new Logger(FinanceSettlementProcessor.name);

  constructor(private readonly financeService: FinanceService) {
    super();
  }

  async process(job: Job<any, any, string>): Promise<any> {
    const { teamId, season } = job.data;

    try {
      this.logger.log(`Processing weekly settlement for team: ${teamId}`);
      await this.financeService.processWeeklySettlement(teamId, season);
      this.logger.log(`Weekly settlement completed for team ${teamId}`);
    } catch (error) {
      this.logger.error(
        `Finance settlement failed: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  @OnWorkerEvent('completed')
  onCompleted(job: Job) {
    this.logger.debug(`Finance settlement job ${job.id} completed.`);
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job, err: Error) {
    this.logger.error(
      `Finance settlement job ${job.id} failed: ${err.message}`,
    );
  }
}
