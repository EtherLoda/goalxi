import { FinanceService } from '@/api/finance/finance.service';
import { LOGGER_SERVICE, PinoLoggerService } from '@goalxi/logger';
import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Injectable } from '@nestjs/common';
import { Job } from 'bullmq';

@Injectable()
@Processor('finance-settlement')
export class FinanceSettlementProcessor extends WorkerHost {
  /** Active job-scoped logger, bound to the inbound traceId at process() start. */
  private jobLog!: PinoLoggerService;

  constructor(
    @Inject(LOGGER_SERVICE)
    private readonly logger: PinoLoggerService,
    private readonly financeService: FinanceService,
  ) {
    super();
  }

  async process(job: Job<any, any, string>): Promise<any> {
    const { teamId, season, week, traceId } = job.data;
    this.jobLog = traceId ? this.logger.child({ traceId }) : this.logger;

    try {
      this.jobLog.info(
        `Processing weekly settlement for team: ${teamId} (Season ${season}, Week ${week})`,
      );
      await this.financeService.processWeeklySettlement(teamId, season, week);
      this.jobLog.info(`Weekly settlement completed for team ${teamId}`);
    } catch (error) {
      this.jobLog.error(
        `Finance settlement failed: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  @OnWorkerEvent('completed')
  onCompleted(job: Job) {
    this.jobLog?.debug(`Finance settlement job ${job.id} completed.`);
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job, err: Error) {
    this.jobLog?.error(
      `Finance settlement job ${job.id} failed: ${err.message}`,
    );
  }
}
