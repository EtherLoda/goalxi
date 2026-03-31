import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../../guards/auth.guard';
import { CurrentUser } from '../../decorators/current-user.decorator';
import { TrainingService } from './training.service';
import { StaffsService } from '../staffs/staffs.service';
import { PlayerEntity, StaffEntity, TeamEntity, Uuid, TrainingResult } from '@goalxi/database';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { StaffRole, TrainingSlot } from '@goalxi/database';
import { getSkillCategory } from '@goalxi/database';

@Controller('training')
@UseGuards(AuthGuard)
export class TrainingController {
    constructor(
        private readonly trainingService: TrainingService,
        private readonly staffsService: StaffsService,
        @InjectRepository(TeamEntity)
        private teamRepo: Repository<TeamEntity>,
        @InjectRepository(PlayerEntity)
        private playerRepo: Repository<PlayerEntity>,
        @InjectRepository(StaffEntity)
        private staffRepo: Repository<StaffEntity>,
    ) {}

    /** Get weekly training points preview for current user's team */
    @Get('weekly-points')
    async getWeeklyPoints(@CurrentUser('id') userId: Uuid): Promise<WeeklyPointsDto[]> {
        const team = await this.teamRepo.findOneBy({ userId });
        if (!team) return [];

        const staffList = await this.staffsService.findByTeam(team.id);
        const players = await this.playerRepo.find({ where: { teamId: team.id as Uuid } });

        return players.map(player => {
            const points = this.trainingService.calculateWeeklyTrainingPoints(player, staffList);
            const skills = player.isGoalkeeper
                ? ['pace', 'strength', 'reflexes', 'handling', 'distribution', 'positioning', 'composure', 'freeKicks', 'penalties']
                : ['pace', 'strength', 'finishing', 'passing', 'dribbling', 'defending', 'positioning', 'composure', 'freeKicks', 'penalties'];

            return {
                playerId: player.id,
                playerName: player.name,
                trainingSlot: player.trainingSlot,
                age: player.age,
                weeklyPoints: points,
                skillBreakdown: skills.map(skill => {
                    const current = this.getSkillLevel(player, skill);
                    const potential = this.getSkillPotential(player, skill);
                    const category = getSkillCategory(skill);
                    return {
                        skill,
                        current,
                        potential,
                        category,
                        remainingToPotential: potential - current,
                    };
                }),
            };
        });
    }

    /** Get training status for a specific player */
    @Get('player/:id')
    async getPlayerTraining(
        @Param('id') playerId: string,
        @CurrentUser('id') userId: Uuid,
    ): Promise<PlayerTrainingDto> {
        const player = await this.playerRepo.findOne({ where: { id: playerId as Uuid } });
        if (!player) {
            return null;
        }

        const team = await this.teamRepo.findOneBy({ userId });
        if (!team || player.teamId !== team.id) {
            return null;
        }

        const staffList = await this.staffsService.findByTeam(team.id);
        const weeklyPoints = this.trainingService.calculateWeeklyTrainingPoints(player, staffList);

        const skills = player.isGoalkeeper
            ? ['pace', 'strength', 'reflexes', 'handling', 'distribution', 'positioning', 'composure', 'freeKicks', 'penalties']
            : ['pace', 'strength', 'finishing', 'passing', 'dribbling', 'defending', 'positioning', 'composure', 'freeKicks', 'penalties'];

        return {
            playerId: player.id,
            playerName: player.name,
            trainingSlot: player.trainingSlot,
            age: player.age,
            weeklyPoints,
            skills: skills.map(skill => {
                const current = this.getSkillLevel(player, skill);
                const potential = this.getSkillPotential(player, skill);
                const category = getSkillCategory(skill);
                const weeksToPotential = this.estimateWeeksToPotential(current, potential, weeklyPoints, category);

                return {
                    skill,
                    current,
                    potential,
                    category,
                    weeksToPotential,
                };
            }),
        };
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
        return 20;
    }

    private estimateWeeksToPotential(
        current: number,
        potential: number,
        weeklyPoints: number,
        category: string | null,
    ): number | null {
        if (current >= potential || weeklyPoints === 0) return null;

        // Import the cost function inline to avoid circular deps
        // For simplicity, just use a rough estimate
        // This is an approximation since actual cost varies by level
        const avgCostPerLevel = 50; // Rough average
        const levelsToGain = potential - current;
        return Math.ceil((levelsToGain * avgCostPerLevel) / weeklyPoints);
    }
}

export interface WeeklyPointsDto {
    playerId: string;
    playerName: string;
    trainingSlot: TrainingSlot;
    age: number;
    weeklyPoints: number;
    skillBreakdown: SkillBreakdownDto[];
}

export interface SkillBreakdownDto {
    skill: string;
    current: number;
    potential: number;
    category: string | null;
    remainingToPotential: number;
}

export interface PlayerTrainingDto {
    playerId: string;
    playerName: string;
    trainingSlot: TrainingSlot;
    age: number;
    weeklyPoints: number;
    skills: PlayerSkillDto[];
}

export interface PlayerSkillDto {
    skill: string;
    current: number;
    potential: number;
    category: string | null;
    weeksToPotential: number | null;
}
