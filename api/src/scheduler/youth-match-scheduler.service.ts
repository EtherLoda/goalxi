import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThanOrEqual, Not, IsNull } from 'typeorm';
import {
    YouthMatchEntity,
    YouthMatchStatus,
    YouthMatchTacticsEntity,
    YouthMatchEventEntity,
    GAME_SETTINGS,
} from '@goalxi/database';

/**
 * Youth Match Scheduler Service
 *
 * Handles:
 * - Locking youth match tactics 30 minutes before kickoff
 * - Queuing youth match simulations to BullMQ
 * - Updating youth match status to IN_PROGRESS when it's time
 */
@Injectable()
export class YouthMatchSchedulerService {
    private readonly logger = new Logger(YouthMatchSchedulerService.name);

    constructor(
        @InjectQueue('youth-match-simulation')
        private simulationQueue: Queue,
        @InjectRepository(YouthMatchEntity)
        private matchRepository: Repository<YouthMatchEntity>,
        @InjectRepository(YouthMatchTacticsEntity)
        private tacticsRepository: Repository<YouthMatchTacticsEntity>,
        @InjectRepository(YouthMatchEventEntity)
        private eventRepository: Repository<YouthMatchEventEntity>,
    ) {}

    /**
     * Lock tactics for youth matches that are 30 minutes away
     * Called by the scheduler every minute
     */
    async lockTactics(): Promise<void> {
        const deadlineMinutes = GAME_SETTINGS.MATCH_TACTICS_DEADLINE_MINUTES;
        const now = new Date();
        const deadline = new Date(now.getTime() + deadlineMinutes * 60 * 1000);

        // Find matches that are within the deadline window and not yet locked
        const matches = await this.matchRepository.find({
            where: {
                status: YouthMatchStatus.SCHEDULED,
                tacticsLocked: false,
                scheduledAt: LessThanOrEqual(deadline),
            },
            relations: ['homeYouthTeam', 'awayYouthTeam'],
        });

        if (matches.length === 0) {
            return;
        }

        this.logger.log(`[TacticsLockScheduler] Found ${matches.length} youth matches to lock`);

        for (const match of matches) {
            try {
                // Fetch tactics for both teams
                const homeTactics = await this.tacticsRepository.findOne({
                    where: { youthMatchId: match.id, teamId: match.homeYouthTeamId },
                });
                const awayTactics = await this.tacticsRepository.findOne({
                    where: { youthMatchId: match.id, teamId: match.awayYouthTeamId },
                });

                // Forfeit if no tactics submitted
                if (!homeTactics) {
                    match.homeForfeit = true;
                    this.logger.warn(
                        `[TacticsLockScheduler] No home tactics for youth match ${match.id}, forfeiting home team`
                    );
                }
                if (!awayTactics) {
                    match.awayForfeit = true;
                    this.logger.warn(
                        `[TacticsLockScheduler] No away tactics for youth match ${match.id}, forfeiting away team`
                    );
                }

                // Lock tactics
                match.tacticsLocked = true;
                match.tacticsLockedAt = new Date();

                // Queue simulation job immediately after locking tactics
                const jobData = {
                    youthMatchId: match.id,
                    homeForfeit: match.homeForfeit,
                    awayForfeit: match.awayForfeit,
                };

                this.logger.log(
                    `[TacticsLockScheduler] 🚀 Queueing youth simulation job to BullMQ queue 'youth-match-simulation'...`
                );

                const job = await this.simulationQueue.add('simulate-youth-match', jobData);

                this.logger.log(
                    `[TacticsLockScheduler] ✅ Youth simulation job added to BullMQ! ` +
                    `Job ID: ${job.id}, Youth Match ID: ${match.id}`
                );

                this.logger.log(
                    `🔒 Youth tactics locked for match ${match.id} ` +
                    `(${match.homeYouthTeam?.name || 'Home'} vs ${match.awayYouthTeam?.name || 'Away'}). ` +
                    `Scheduled: ${match.scheduledAt.toISOString()}. ` +
                    `Simulation job ${job.id} queued to BullMQ.`,
                );

                await this.matchRepository.save(match);
            } catch (error) {
                this.logger.error(
                    `[TacticsLockScheduler] Failed to lock youth match ${match.id}: ${(error as Error).message}`,
                    (error as Error).stack,
                );
            }
        }
    }

    /**
     * Start youth matches that are at their scheduled time
     * Called by the scheduler every minute
     */
    async startMatches(): Promise<void> {
        const now = new Date();

        // Find matches that should start now
        const matches = await this.matchRepository.find({
            where: {
                status: YouthMatchStatus.TACTICS_LOCKED,
                scheduledAt: LessThanOrEqual(now),
            },
            relations: ['homeYouthTeam', 'awayYouthTeam'],
        });

        if (matches.length === 0) {
            return;
        }

        this.logger.log(`[MatchStartScheduler] Found ${matches.length} youth matches to start`);

        for (const match of matches) {
            try {
                match.status = YouthMatchStatus.IN_PROGRESS;
                match.startedAt = match.scheduledAt;
                await this.matchRepository.save(match);

                this.logger.log(
                    `⚽ Youth match started: ${match.homeYouthTeam?.name || 'Home'} vs ${match.awayYouthTeam?.name || 'Away'} ` +
                    `(ID: ${match.id}, Scheduled: ${match.scheduledAt.toISOString()})`,
                );
            } catch (error) {
                this.logger.error(
                    `[MatchStartScheduler] Failed to start youth match ${match.id}: ${(error as Error).message}`,
                    (error as Error).stack,
                );
            }
        }
    }

    /**
     * Complete youth matches that have ended
     * Called by the scheduler every minute
     */
    async completeMatches(): Promise<void> {
        const now = new Date();

        // Find matches that are in progress and have ended
        const matches = await this.matchRepository.find({
            where: {
                status: YouthMatchStatus.IN_PROGRESS,
            },
            relations: ['homeYouthTeam', 'awayYouthTeam'],
        });

        if (matches.length === 0) {
            return;
        }

        for (const match of matches) {
            // Check if the match has ended (simulationCompletedAt is set and actualEndTime has passed)
            if (!match.simulationCompletedAt || !match.actualEndTime) {
                continue;
            }

            if (now >= match.actualEndTime) {
                try {
                    match.status = YouthMatchStatus.COMPLETED;
                    match.completedAt = match.actualEndTime;
                    await this.matchRepository.save(match);

                    this.logger.log(
                        `🏁 Youth match completed: ${match.homeYouthTeam?.name || 'Home'} vs ${match.awayYouthTeam?.name || 'Away'} ` +
                        `(ID: ${match.id}, Score: ${match.homeScore}-${match.awayScore})`,
                    );
                } catch (error) {
                    this.logger.error(
                        `[MatchCompleteScheduler] Failed to complete youth match ${match.id}: ${(error as Error).message}`,
                        (error as Error).stack,
                    );
                }
            }
        }
    }
}
