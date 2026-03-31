import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
    PlayerEntity,
    StaffEntity,
    TrainingSlot,
    Uuid,
} from '@goalxi/database';
import {
    applyTrainingToPlayer,
    TrainingResult,
    SkillGain,
} from '@goalxi/database';

@Injectable()
export class TrainingService {
    private readonly logger = new Logger(TrainingService.name);

    constructor(
        @InjectRepository(PlayerEntity)
        private playerRepo: Repository<PlayerEntity>,
        @InjectRepository(StaffEntity)
        private staffRepo: Repository<StaffEntity>,
    ) {}

    /**
     * Calculate weekly training points for a player
     */
    calculateWeeklyTrainingPoints(
        player: PlayerEntity,
        staffList: StaffEntity[],
    ): number {
        const weeklyPoints = applyTrainingToPlayer(
            player.id,
            player.age,
            player.currentSkills,
            player.potentialSkills,
            player.trainingSlot,
            player.isGoalkeeper,
            staffList,
            1, // 1 week for calculation
        );
        return weeklyPoints.weeklyPoints;
    }

    /**
     * Apply training to a single player after a match
     * @param player The player to train
     * @param weeksElapsed Number of weeks since last training (typically 1)
     * @param staffList Team staff list for bonus calculation
     * @returns Summary of training applied
     */
    async applyTrainingToPlayer(
        player: PlayerEntity,
        weeksElapsed: number,
        staffList: StaffEntity[],
    ): Promise<TrainingResult> {
        const result = applyTrainingToPlayer(
            player.id,
            player.age,
            player.currentSkills,
            player.potentialSkills,
            player.trainingSlot,
            player.isGoalkeeper,
            staffList,
            weeksElapsed,
        );

        if (result.weeklyPoints > 0) {
            await this.playerRepo.save(player);
        }

        return result;
    }

    /**
     * Process training for all players on a team after a match
     */
    async processTeamTraining(
        teamId: string,
        weeksElapsed: number = 1,
    ): Promise<TrainingResult[]> {
        // Get all active staff for bonus calculation
        const staffList = await this.staffRepo.find({
            where: { teamId, isActive: true },
        });

        // Get all players on the team (excluding youth academy)
        const players = await this.playerRepo.find({
            where: { teamId: teamId as Uuid },
        });

        const results: TrainingResult[] = [];

        for (const player of players) {
            const result = await this.applyTrainingToPlayer(player, weeksElapsed, staffList);
            results.push(result);
        }

        this.logger.log(
            `Training processed for team ${teamId}: ${results.length} players, ` +
            `${results.filter(r => r.weeklyPoints > 0).length} received training`,
        );

        return results;
    }
}
