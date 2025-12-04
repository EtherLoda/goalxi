import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';
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

    @Cron('* * * * *') // Every minute
    async lockTacticsAndSimulate() {
        const deadlineMs =
            GAME_SETTINGS.MATCH_TACTICS_DEADLINE_MINUTES * 60 * 1000;
        const targetTime = new Date(Date.now() + deadlineMs);

        // Find matches that are 30 minutes away (within a 1-minute window)
        const matches = await this.matchRepository.find({
            where: {
                status: MatchStatus.SCHEDULED,
                scheduledAt: Between(
                    new Date(targetTime.getTime() - 60000),
                    new Date(targetTime.getTime() + 60000),
                ),
            },
        });

        for (const match of matches) {
            try {
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
                    `Locked tactics for match ${match.id}. Home forfeit: ${match.homeForfeit}, Away forfeit: ${match.awayForfeit}`,
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
            } catch (error) {
                this.logger.error(
                    `Failed to process match ${match.id}: ${error.message}`,
                );
            }
        }
    }
}
