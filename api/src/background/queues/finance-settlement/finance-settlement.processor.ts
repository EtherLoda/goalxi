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

  // `OnWorkerEvent` handlers run on the worker, not per-job, so they
  // share `this` across concurrent job lifecycle events. We deliberately
  // log through the injected `logger` here, NOT `this.jobLog`:
  //   - `this.jobLog` is set/overwritten at the top of every `process()`
  //     and would race — by the time the worker fires 'completed' for
  //     job A, another process() may have already overwritten the field
  //     for job B, silently misattributing job A's completion to B.
  //   - The process() catch block already records the error with full
  //     traceId and stack, so the worker's 'failed' hook only needs to
  //     surface the job id (BullMQ's own bookkeeping) — it does not
  //     have to re-attach the trace context.

  @OnWorkerEvent('completed')
  onCompleted(job: Job) {
    this.logger.info(`Finance settlement job ${job.id} completed.`);
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job, err: Error) {
    this.logger.error(
      `Finance settlement job ${job.id} failed: ${err.message}`,
      err.stack,
    );
  }
}
