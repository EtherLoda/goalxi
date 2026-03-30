import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThanOrEqual, LessThan } from 'typeorm';
import {
    MatchEntity,
    MatchTacticsEntity,
    MatchEventEntity,
    MatchStatus,
    GAME_SETTINGS,
} from '@goalxi/database';

@Injectable()
export class MatchSchedulerService {
    private readonly logger = new Logger(MatchSchedulerService.name);

    constructor(
        @InjectQueue('match-simulation')
        private simulationQueue: Queue,
        @InjectQueue('match-completion')
        private completionQueue: Queue,
        @InjectRepository(MatchEntity)
        private matchRepository: Repository<MatchEntity>,
        @InjectRepository(MatchTacticsEntity)
        private tacticsRepository: Repository<MatchTacticsEntity>,
        @InjectRepository(MatchEventEntity)
        private eventRepository: Repository<MatchEventEntity>,
    ) { }

    // ===== SCHEDULER 1: Lock Tactics 30 Minutes Before Match =====
    @Cron('0 * * * * *') // Every minute
    async lockTactics() {
        const now = new Date();
        this.logger.debug(
            `[TacticsLockScheduler] Running at ${now.toISOString()} - Checking for matches to lock`
        );

        const lockThreshold = new Date(
            now.getTime() + GAME_SETTINGS.MATCH_TACTICS_DEADLINE_MINUTES * 60 * 1000,
        );

        this.logger.debug(
            `[TacticsLockScheduler] Looking for matches scheduled before ${lockThreshold.toISOString()} ` +
            `(${GAME_SETTINGS.MATCH_TACTICS_DEADLINE_MINUTES} minutes from now)`
        );

        // Find matches scheduled within next 30 minutes that haven't been locked
        const matches = await this.matchRepository.find({
            where: {
                status: MatchStatus.SCHEDULED,
                tacticsLocked: false,
                scheduledAt: LessThanOrEqual(lockThreshold),
            },
        });

        this.logger.debug(
            `[TacticsLockScheduler] Query result: Found ${matches.length} match(es) ` +
            `(status=SCHEDULED, tacticsLocked=false, scheduledAt<=${lockThreshold.toISOString()})`
        );

        if (matches.length === 0) {
            return;
        }

        this.logger.log(
            `[TacticsLockScheduler] ✅ Found ${matches.length} match(es) ready for tactics locking`,
        );

        for (const match of matches) {
            try {
                this.logger.log(
                    `[TacticsLockScheduler] Processing match ${match.id}: ` +
                    `${match.homeTeam?.name || 'Home'} vs ${match.awayTeam?.name || 'Away'}, ` +
                    `Scheduled: ${match.scheduledAt.toISOString()}`
                );

                // Get tactics for both teams
                const [homeTactics, awayTactics] = await Promise.all([
                    this.tacticsRepository.findOne({
                        where: { matchId: match.id, teamId: match.homeTeamId },
                    }),
                    this.tacticsRepository.findOne({
                        where: { matchId: match.id, teamId: match.awayTeamId },
                    }),
                ]);

                this.logger.debug(
                    `[TacticsLockScheduler] Tactics check - ` +
                    `Home: ${homeTactics ? '✅ submitted' : '❌ missing'}, ` +
                    `Away: ${awayTactics ? '✅ submitted' : '❌ missing'}`
                );

                // Mark forfeits and lock tactics
                match.homeForfeit = !homeTactics;
                match.awayForfeit = !awayTactics;
                match.tacticsLocked = true;
                match.tacticsLockedAt = now;
                match.status = MatchStatus.TACTICS_LOCKED;
                await this.matchRepository.save(match);

                this.logger.log(
                    `[TacticsLockScheduler] ✅ Match ${match.id} tactics locked and saved to DB`
                );

                // Queue simulation job immediately after locking tactics
                const jobData = {
                    matchId: match.id,
                    homeTeamId: match.homeTeamId,
                    awayTeamId: match.awayTeamId,
                    homeTactics: homeTactics || null,
                    awayTactics: awayTactics || null,
                    homeForfeit: match.homeForfeit,
                    awayForfeit: match.awayForfeit,
                    matchType: match.type,
                };

                this.logger.log(
                    `[TacticsLockScheduler] 🚀 Queueing simulation job to BullMQ queue 'match-simulation'...`
                );

                const job = await this.simulationQueue.add('simulate-match', jobData);

                this.logger.log(
                    `[TacticsLockScheduler] ✅ Simulation job added to BullMQ! ` +
                    `Job ID: ${job.id}, Match ID: ${match.id}`
                );

                this.logger.log(
                    `🔒 Tactics locked for match ${match.id} ` +
                    `(${match.homeTeam?.name || 'Home'} vs ${match.awayTeam?.name || 'Away'}). ` +
                    `Scheduled: ${match.scheduledAt.toISOString()}. ` +
                    `Simulation job ${job.id} queued to BullMQ.`,
                );
            } catch (error) {
                this.logger.error(
                    `[TacticsLockScheduler] Failed to lock match ${match.id}: ${error.message}`,
                    error.stack,
                );
            }
        }
    }

    // ===== SCHEDULER 2: Start Match at Scheduled Time (Mark as IN_PROGRESS) =====
    @Cron('*/30 * * * * *') // Every 30 seconds
    async startMatches() {
        this.logger.debug('[MatchStartScheduler] Checking for matches to start');

        const now = new Date();

        // Find matches that should start now (simulation already queued at tactics lock)
        const matches = await this.matchRepository.find({
            where: {
                status: MatchStatus.TACTICS_LOCKED,
                scheduledAt: LessThanOrEqual(now),
            },
        });

        if (matches.length === 0) {
            return;
        }

        this.logger.log(
            `[MatchStartScheduler] Found ${matches.length} match(es) ready to start`,
        );

        for (const match of matches) {
            try {
                // Update match status to IN_PROGRESS (simulation was already queued at tactics lock)
                match.status = MatchStatus.IN_PROGRESS;
                match.startedAt = match.scheduledAt; // Use scheduled time, not current time
                await this.matchRepository.save(match);

                this.logger.log(
                    `⚽ Match started: ${match.homeTeam?.name || 'Home'} vs ${match.awayTeam?.name || 'Away'} ` +
                    `(ID: ${match.id}, Scheduled: ${match.scheduledAt.toISOString()})`,
                );
            } catch (error) {
                this.logger.error(
                    `[MatchStartScheduler] Failed to start match ${match.id}: ${error.message}`,
                    error.stack,
                );
            }
        }
    }

    // ===== SCHEDULER 3: Complete Match After All Events Revealed =====
    @Cron('0 * * * * *') // Every minute
    async completeMatches() {
        this.logger.debug('[MatchCompletionScheduler] Checking for matches to complete');

        const now = new Date();

        // Find matches that are currently in progress
        const matches = await this.matchRepository.find({
            where: {
                status: MatchStatus.IN_PROGRESS,
            },
        });

        if (matches.length === 0) {
            return;
        }

        for (const match of matches) {
            try {
                // Get the last event for this match
                const lastEvent = await this.eventRepository.findOne({
                    where: { matchId: match.id },
                    order: { eventScheduledTime: 'DESC' },
                    select: ['id', 'matchId', 'minute', 'eventScheduledTime'],
                });

                // If no events or last event hasn't happened yet, skip
                if (!lastEvent || !lastEvent.eventScheduledTime) {
                    continue;
                }

                // Check if last event time has passed
                if (lastEvent.eventScheduledTime <= now) {
                    match.status = MatchStatus.COMPLETED;
                    match.completedAt = lastEvent.eventScheduledTime;
                    match.actualEndTime = lastEvent.eventScheduledTime;
                    await this.matchRepository.save(match);

                    // Queue post-match processing (player stats, league standings)
                    await this.completionQueue.add(
                        'complete-match',
                        { matchId: match.id },
                        { jobId: `complete-${match.id}` }
                    );

                    this.logger.log(
                        `🏁 Match completed: ${match.homeTeam?.name || 'Home'} ${match.homeScore || 0} - ` +
                        `${match.awayScore || 0} ${match.awayTeam?.name || 'Away'} ` +
                        `(ID: ${match.id})`,
                    );
                }
            } catch (error) {
                this.logger.error(
                    `[MatchCompletionScheduler] Failed to complete match ${match.id}: ${error.message}`,
                    error.stack,
                );
            }
        }
    }
}
