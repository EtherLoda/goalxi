
import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { MatchCompletionService } from '@/api/match/match-completion.service';

@Injectable()
@Processor('match-completion')
export class MatchCompletionProcessor extends WorkerHost {
    private readonly logger = new Logger(MatchCompletionProcessor.name);

    constructor(
        private readonly completionService: MatchCompletionService,
    ) {
        super();
    }

    async process(job: Job<any, any, string>): Promise<any> {
        this.logger.log(`Processing match completion for match ID: ${job.data.matchId}`);

        const { matchId } = job.data;

        try {
            await this.completionService.completeMatch(matchId);
            this.logger.log(`Post-match processing completed for match ${matchId}`);
        } catch (error) {
            this.logger.error(`Post-match processing failed for match ${matchId}: ${error.message}`, error.stack);
            throw error;
        }
    }

    @OnWorkerEvent('completed')
    onCompleted(job: Job) {
        this.logger.debug(`Match completion job ${job.id} completed.`);
    }

    @OnWorkerEvent('failed')
    onFailed(job: Job, err: Error) {
        this.logger.error(`Match completion job ${job.id} failed: ${err.message}`);
    }
}
