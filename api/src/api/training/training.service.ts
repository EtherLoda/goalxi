import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import {
    PlayerEntity,
    StaffEntity,
    TrainingSlot,
    StaffRole,
    Uuid,
} from '@goalxi/database';
import {
    TRAINING_SETTINGS,
    getAgeTrainingFactor,
    getSkillUpgradeCost,
    getSkillCategory,
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
     * = BASE_WEEKLY × slotMultiplier × ageFactor × coachBonus
     */
    calculateWeeklyTrainingPoints(
        player: PlayerEntity,
        staffList: StaffEntity[],
    ): number {
        const slotMultiplier = this.getSlotMultiplier(player.trainingSlot);
        if (slotMultiplier === 0) return 0;

        const ageFactor = getAgeTrainingFactor(player.age);
        const coachBonus = this.getCoachBonus(staffList, player.isGoalkeeper);

        return Math.round(
            TRAINING_SETTINGS.BASE_WEEKLY_TRAINING *
                slotMultiplier *
                ageFactor *
                coachBonus *
                100,
        ) / 100;
    }

    /**
     * Get training slot multiplier
     */
    private getSlotMultiplier(slot: TrainingSlot): number {
        switch (slot) {
            case TrainingSlot.ENHANCED:
                return TRAINING_SETTINGS.ENHANCED_MULTIPLIER;
            case TrainingSlot.REGULAR:
                return TRAINING_SETTINGS.REGULAR_MULTIPLIER;
            case TrainingSlot.NONE:
            default:
                return TRAINING_SETTINGS.NONE_MULTIPLIER;
        }
    }

    /**
     * Calculate combined coach bonus for a player
     * Each skill gets: head coach bonus + relevant category coach bonus
     * Formula: 1 + headBonus + categoryBonus (additive)
     *
     * For example with LEVEL_5 coaches and all category coaches present:
     * - Each skill gets: 1 + 0.25 (head) + 0.25 (relevant coach) = 1.5x
     *
     * Note: This returns an AVERAGE bonus across all player skills.
     * When all category coaches are present, every skill gets its relevant coach bonus.
     */
    private getCoachBonus(staffList: StaffEntity[], isGoalkeeper: boolean): number {
        const activeStaff = staffList.filter(s => s.isActive);
        const headCoach = activeStaff.find(s => s.role === StaffRole.HEAD_COACH);
        const headBonus = headCoach
            ? headCoach.level * TRAINING_SETTINGS.COACH_BONUS_PER_LEVEL
            : 0;

        const categories = isGoalkeeper
            ? ['goalkeeper']
            : ['physical', 'technical', 'mental', 'setPieces'];

        // Count categories with coaches and sum their bonuses
        let categoriesWithCoaches = 0;
        let totalCategoryBonus = 0;
        for (const category of categories) {
            const coachRole = this.getCoachRoleForCategory(category);
            if (coachRole) {
                const coach = activeStaff.find(s => s.role === coachRole);
                if (coach) {
                    categoriesWithCoaches++;
                    totalCategoryBonus += coach.level * TRAINING_SETTINGS.COACH_BONUS_PER_LEVEL;
                }
            }
        }

        // Average category bonus across all categories (not just those with coaches)
        // This represents: if a skill has its coach, it gets that bonus
        // If not, it gets 0 from categories
        const avgCategoryBonus = totalCategoryBonus / categories.length;

        // Additive: 1 + head + average category
        return 1 + headBonus + avgCategoryBonus;
    }

    private getCoachRoleForCategory(category: string): StaffRole | null {
        const map: Record<string, StaffRole> = {
            physical: StaffRole.FITNESS_COACH,
            technical: StaffRole.TECHNICAL_COACH,
            goalkeeper: StaffRole.GOALKEEPER_COACH,
            mental: StaffRole.PSYCHOLOGY_COACH,
            setPieces: StaffRole.SET_PIECE_COACH,
        };
        return map[category] || null;
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
        const weeklyPoints = this.calculateWeeklyTrainingPoints(player, staffList);
        if (weeklyPoints === 0) {
            return {
                playerId: player.id,
                weeklyPoints: 0,
                skillsGained: [],
                totalPointsSpent: 0,
            };
        }

        const totalPoints = weeklyPoints * weeksElapsed;
        const result = this.distributeTrainingPoints(player, totalPoints);

        // Save the updated player
        await this.playerRepo.save(player);

        return {
            playerId: player.id,
            weeklyPoints,
            skillsGained: result.gains,
            totalPointsSpent: result.totalSpent,
        };
    }

    /**
     * Distribute training points across skills, prioritizing lower-level skills
     */
    private distributeTrainingPoints(
        player: PlayerEntity,
        totalPoints: number,
    ): { gains: SkillGain[]; totalSpent: number } {
        const gains: SkillGain[] = [];
        let remaining = totalPoints;
        let totalSpent = 0;

        // Get all skill keys for this player type
        const skillKeys = this.getPlayerSkillKeys(player);

        // Sort by current level (lowest first) to prioritize growth
        const sortedKeys = [...skillKeys].sort((a, b) => {
            const levelA = this.getSkillLevel(player, a);
            const levelB = this.getSkillLevel(player, b);
            return levelA - levelB;
        });

        for (const key of sortedKeys) {
            if (remaining <= 0) break;

            const currentLevel = this.getSkillLevel(player, key);
            const potentialLevel = this.getSkillPotential(player, key);

            if (currentLevel >= potentialLevel) {
                // Already at potential, skip
                continue;
            }

            // Calculate how many levels we can afford
            let levelsGained = 0;
            let pointsNeeded = 0;

            // Try to gain one level at a time
            let tempLevel = currentLevel;
            let tempCost = 0;

            while (tempLevel < potentialLevel && remaining >= tempCost + getSkillUpgradeCost(tempLevel)) {
                tempCost += getSkillUpgradeCost(tempLevel);
                tempLevel++;
                levelsGained++;
                pointsNeeded = tempCost;
            }

            if (levelsGained > 0) {
                // Apply the gain
                this.setSkillLevel(player, key, tempLevel);
                gains.push({ skill: key, levels: levelsGained });
                remaining -= pointsNeeded;
                totalSpent += pointsNeeded;
            }
        }

        return { gains, totalSpent };
    }

    private getPlayerSkillKeys(player: PlayerEntity): string[] {
        if (player.isGoalkeeper) {
            return ['pace', 'strength', 'reflexes', 'handling', 'distribution', 'positioning', 'composure', 'freeKicks', 'penalties'];
        }
        return ['pace', 'strength', 'finishing', 'passing', 'dribbling', 'defending', 'positioning', 'composure', 'freeKicks', 'penalties'];
    }

    private getSkillLevel(player: PlayerEntity, key: string): number {
        const skills = player.currentSkills as unknown as Record<string, Record<string, number>>;
        for (const category of Object.values(skills)) {
            if (category && typeof category === 'object' && key in category) {
                return category[key];
            }
        }
        return 0;
    }

    private getSkillPotential(player: PlayerEntity, key: string): number {
        const potential = player.potentialSkills as unknown as Record<string, Record<string, number>>;
        for (const category of Object.values(potential)) {
            if (category && typeof category === 'object' && key in category) {
                return category[key];
            }
        }
        return 20; // Default max
    }

    private setSkillLevel(player: PlayerEntity, key: string, level: number): void {
        const skills = player.currentSkills as unknown as Record<string, Record<string, number>>;
        for (const category of Object.keys(skills)) {
            if (skills[category] && key in skills[category]) {
                skills[category][key] = level;
                return;
            }
        }
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
        // For now, get all players - we can filter by一线队 later
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

export interface TrainingResult {
    playerId: string;
    weeklyPoints: number;
    skillsGained: SkillGain[];
    totalPointsSpent: number;
}

export interface SkillGain {
    skill: string;
    levels: number;
}
