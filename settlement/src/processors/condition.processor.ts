import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Job } from 'bullmq';
import {
    PlayerEntity,
    StaffEntity,
    TeamEntity,
    FanEntity,
    StaffRole,
    updatePlayerForm,
    ConditionInputs,
} from '@goalxi/database';

@Injectable()
@Processor('condition-settlement')
export class ConditionProcessor extends WorkerHost {
    private readonly logger = new Logger(ConditionProcessor.name);

    constructor(
        @InjectRepository(PlayerEntity)
        private playerRepo: Repository<PlayerEntity>,
        @InjectRepository(StaffEntity)
        private staffRepo: Repository<StaffEntity>,
        @InjectRepository(TeamEntity)
        private teamRepo: Repository<TeamEntity>,
        @InjectRepository(FanEntity)
        private fanRepo: Repository<FanEntity>,
    ) {
        super();
    }

    async process(job: Job<any, any, string>): Promise<any> {
        this.logger.log(
            '[ConditionProcessor] Starting condition settlement processing...',
        );

        const startTime = Date.now();
        let totalPlayersProcessed = 0;

        try {
            // Get all teams
            const teams = await this.teamRepo.find();
            this.logger.log(`[ConditionProcessor] Processing ${teams.length} teams`);

            for (const team of teams) {
                const result = await this.processTeamCondition(team.id);
                totalPlayersProcessed += result.playersProcessed;
            }

            const duration = Date.now() - startTime;
            this.logger.log(
                `[ConditionProcessor] Condition settlement completed! ` +
                    `${totalPlayersProcessed} players processed ` +
                    `in ${duration}ms`,
            );

            return {
                teamsProcessed: teams.length,
                playersProcessed: totalPlayersProcessed,
                durationMs: duration,
            };
        } catch (error) {
            this.logger.error(
                `[ConditionProcessor] Condition settlement failed: ${error.message}`,
                error.stack,
            );
            throw error;
        }
    }

    private async processTeamCondition(teamId: string): Promise<{
        playersProcessed: number;
    }> {
        // Get head coach for the team
        const headCoach = await this.staffRepo.findOne({
            where: { teamId, role: StaffRole.HEAD_COACH, isActive: true },
        });
        const headCoachLevel = headCoach?.level ?? 3;

        // Get fan emotion for the team
        const fan = await this.fanRepo.findOne({ where: { teamId } });
        const fanEmotion = fan?.fanEmotion ?? 50;

        // Get all players for the team (excluding youth)
        const players = await this.playerRepo.find({
            where: { teamId, isYouth: false },
        });

        let playersProcessed = 0;

        for (const player of players) {
            // Use accumulated match minutes since last condition update
            const minutesPlayed = player.matchMinutes;

            // Prepare inputs for condition calculation
            const inputs: ConditionInputs = {
                currentForm: player.form,
                minutesPlayed,
                fanEmotion,
                headCoachLevel,
                currentInjuryValue: player.currentInjuryValue,
            };

            // Calculate new form
            const newForm = updatePlayerForm(inputs);

            // Update player form
            player.form = newForm;
            // Reset match minutes after condition update
            player.matchMinutes = 0;
            await this.playerRepo.save(player);

            this.logger.debug(
                `[ConditionProcessor] Player ${player.name}: form=${newForm.toFixed(2)}, minutes=${minutesPlayed}`,
            );

            playersProcessed++;
        }

        return { playersProcessed };
    }

    @OnWorkerEvent('completed')
    onCompleted(job: Job) {
        this.logger.debug(`Condition settlement job ${job.id} completed`);
    }

    @OnWorkerEvent('failed')
    onFailed(job: Job, err: Error) {
        this.logger.error(
            `Condition settlement job ${job.id} failed: ${err.message}`,
        );
    }
}
