import { MatchCompletionService } from '@/api/match/match-completion.service';
import { LOGGER_SERVICE, PinoLoggerService } from '@goalxi/logger';
import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Injectable } from '@nestjs/common';
import { Job } from 'bullmq';

@Injectable()
@Processor('match-completion')
export class MatchCompletionProcessor extends WorkerHost {
  /** Active job-scoped logger, bound to the inbound traceId at process() start. */
  private jobLog!: PinoLoggerService;

  constructor(
    @Inject(LOGGER_SERVICE)
    private readonly logger: PinoLoggerService,
    private readonly completionService: MatchCompletionService,
  ) {
    super();
  }

  async process(job: Job<any, any, string>): Promise<any> {
    const { matchId, traceId } = job.data;
    this.jobLog = traceId ? this.logger.child({ traceId }) : this.logger;

    try {
      await this.completionService.completeMatch(matchId);
      this.jobLog.info(`[Match] post-processing done matchId=${matchId}`);
    } catch (error) {
      this.jobLog.error(
        `[Match] post-processing failed matchId=${matchId}: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  @OnWorkerEvent('completed')
  onCompleted(job: Job) {
    this.jobLog?.debug(`Match completion job ${job.id} completed.`);
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job, err: Error) {
    this.jobLog?.error(`Match completion job ${job.id} failed: ${err.message}`);
  }
}
