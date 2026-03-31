import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Job } from 'bullmq';
import { FanEntity, TeamEntity, LeagueEntity, FAN_HIDDEN_CAP, FAN_BASE_GROWTH, FAN_BASE_LOSS, FAN_CAP_SMOOTHING } from '@goalxi/database';

@Injectable()
@Processor('fan-settlement')
export class FanProcessor extends WorkerHost {
    private readonly logger = new Logger(FanProcessor.name);

    constructor(
        @InjectRepository(FanEntity)
        private fanRepo: Repository<FanEntity>,
        @InjectRepository(TeamEntity)
        private teamRepo: Repository<TeamEntity>,
        @InjectRepository(LeagueEntity)
        private leagueRepo: Repository<LeagueEntity>,
    ) {
        super();
    }

    /**
     * Calculate weekly fan change
     */
    private calculateWeeklyFanChange(currentFans: number, cap: number, morale: number, recentForm: string): number {
        const ratio = Math.min(currentFans / cap, 0.999);
        const capPressure = Math.pow(1 - ratio, FAN_CAP_SMOOTHING);

        // Morale effect: 30 -> -125, 100 -> +312
        const moraleEffect = (morale - 50) * 6.25;

        // Performance effect: W=+120, D=0, L=-100
        let performanceEffect = 0;
        for (const r of recentForm) {
            if (r === 'W') performanceEffect += 120;
            else if (r === 'L') performanceEffect -= 100;
        }

        // Total growth
        const totalGrowth = FAN_BASE_GROWTH + moraleEffect + performanceEffect;
        const netChange = Math.floor(totalGrowth * capPressure) - FAN_BASE_LOSS;

        // Above 80% cap and no wins: extra penalty
        if (ratio > 0.8 && !recentForm.includes('W')) {
            const penalty = Math.floor(Math.abs(netChange) * 0.5);
            return netChange - penalty;
        }

        return netChange;
    }

    async process(job: Job<any, any, string>): Promise<any> {
        this.logger.log('[FanProcessor] Starting weekly fan settlement...');

        const startTime = Date.now();

        try {
            // Get all teams with league info
            const teams = await this.teamRepo.find({
                relations: ['league'],
            });

            let totalFansUpdated = 0;

            for (const team of teams) {
                const fan = await this.fanRepo.findOne({ where: { teamId: team.id } });
                if (!fan) continue;

                const tier = team.league?.tier || 4;
                const cap = FAN_HIDDEN_CAP[tier as keyof typeof FAN_HIDDEN_CAP] || 100_000;

                // Calculate weekly change
                const change = this.calculateWeeklyFanChange(fan.totalFans, cap, fan.fanMorale, fan.recentForm);
                fan.totalFans = Math.max(1000, fan.totalFans + change);

                await this.fanRepo.save(fan);
                totalFansUpdated++;
            }

            const duration = Date.now() - startTime;
            this.logger.log(
                `[FanProcessor] Fan settlement completed! ` +
                `${totalFansUpdated} teams updated ` +
                `in ${duration}ms`,
            );

            return {
                teamsProcessed: teams.length,
                fansUpdated: totalFansUpdated,
                duration,
            };
        } catch (error) {
            this.logger.error('[FanProcessor] Error processing fan settlement', error);
            throw error;
        }
    }
}
