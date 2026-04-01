import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThanOrEqual } from 'typeorm';
import {
    YouthMatchEntity,
    YouthMatchStatus,
    YouthMatchTacticsEntity,
    YouthMatchEventEntity,
    GAME_SETTINGS,
} from '@goalxi/database';

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

    async lockTactics(): Promise<void> {
        const deadlineMinutes = GAME_SETTINGS.MATCH_TACTICS_DEADLINE_MINUTES;
        const now = new Date();
        const deadline = new Date(now.getTime() + deadlineMinutes * 60 * 1000);

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
                const homeTactics = await this.tacticsRepository.findOne({
                    where: { youthMatchId: match.id, teamId: match.homeYouthTeamId },
                });
                const awayTactics = await this.tacticsRepository.findOne({
                    where: { youthMatchId: match.id, teamId: match.awayYouthTeamId },
                });

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

                match.tacticsLocked = true;
                match.tacticsLockedAt = new Date();

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

    async startMatches(): Promise<void> {
        const now = new Date();

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

    async completeMatches(): Promise<void> {
        const now = new Date();

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
