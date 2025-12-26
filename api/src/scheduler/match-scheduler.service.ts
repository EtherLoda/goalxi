import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThanOrEqual } from 'typeorm';
import {
    MatchEntity,
    MatchTacticsEntity,
    MatchStatus,
    GAME_SETTINGS,
} from '@goalxi/database';

@Injectable()
export class MatchSchedulerService {
    private readonly logger = new Logger(MatchSchedulerService.name);

    constructor(
        @InjectQueue('match-simulation')
        private simulationQueue: Queue,
        @InjectRepository(MatchEntity)
        private matchRepository: Repository<MatchEntity>,
        @InjectRepository(MatchTacticsEntity)
        private tacticsRepository: Repository<MatchTacticsEntity>,
    ) { }

    @Cron('*/5 * * * *') // Every 5 minutes
    async lockTacticsAndSimulate() {
        this.logger.debug('Starting match scheduler cycle');

        const deadlineMs =
            GAME_SETTINGS.MATCH_TACTICS_DEADLINE_MINUTES * 60 * 1000;
        const targetTime = new Date(Date.now() + deadlineMs);

        // Find matches that are scheduled at or before the deadline (catch-up logic)
        // Only process matches that are still SCHEDULED and not yet locked
        const matches = await this.matchRepository.find({
            where: {
                status: MatchStatus.SCHEDULED,
                tacticsLocked: false, // Additional safety check
                scheduledAt: LessThanOrEqual(targetTime),
            },
        });

        if (matches.length === 0) {
            this.logger.debug('No matches to process in this cycle');
            return;
        }

        this.logger.log(
            `Found ${matches.length} match(es) ready for tactics locking and simulation`,
        );

        let processedCount = 0;
        let errorCount = 0;

        for (const match of matches) {
            try {
                // Double-check: skip if already locked (race condition protection)
                if (match.tacticsLocked) {
                    this.logger.warn(
                        `Match ${match.id} is already locked, skipping`,
                    );
                    continue;
                }

                // Get tactics for both teams
                const [homeTactics, awayTactics] = await Promise.all([
                    this.tacticsRepository.findOne({
                        where: { matchId: match.id, teamId: match.homeTeamId },
                    }),
                    this.tacticsRepository.findOne({
                        where: { matchId: match.id, teamId: match.awayTeamId },
                    }),
                ]);

                // Mark forfeits
                match.homeForfeit = !homeTactics;
                match.awayForfeit = !awayTactics;
                match.tacticsLocked = true;
                match.status = MatchStatus.TACTICS_LOCKED;
                await this.matchRepository.save(match);

                this.logger.log(
                    `Locked tactics for match ${match.id} (scheduled: ${match.scheduledAt.toISOString()}). ` +
                        `Home forfeit: ${match.homeForfeit}, Away forfeit: ${match.awayForfeit}`,
                );

                // Send to simulation queue
                await this.simulationQueue.add('simulate-match', {
                    matchId: match.id,
                    homeTeamId: match.homeTeamId,
                    awayTeamId: match.awayTeamId,
                    homeTactics: homeTactics || null,
                    awayTactics: awayTactics || null,
                    homeForfeit: match.homeForfeit,
                    awayForfeit: match.awayForfeit,
                    matchType: match.type,
                });

                this.logger.log(`Queued match ${match.id} for simulation`);
                processedCount++;
            } catch (error) {
                errorCount++;
                this.logger.error(
                    `Failed to process match ${match.id}: ${error.message}`,
                    error.stack,
                );
            }
        }

        this.logger.log(
            `Scheduler cycle completed: ${processedCount} processed, ${errorCount} errors`,
        );
    }
}
