import { Controller, Get, Post, Param, NotFoundException, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../../guards/auth.guard';
import { CurrentUser } from '../../decorators/current-user.decorator';
import { ScoutsService } from './scouts.service';
import { YouthPlayerEntity, ScoutCandidateEntity, TeamEntity } from '@goalxi/database';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Uuid } from '@goalxi/database';

@Controller('scouts')
@UseGuards(AuthGuard)
export class ScoutsController {
    constructor(
        private readonly scoutsService: ScoutsService,
        @InjectRepository(TeamEntity)
        private teamRepo: Repository<TeamEntity>,
    ) {}

    /** Get current team's scout candidates */
    @Get('candidates')
    async getCandidates(@CurrentUser('id') userId: Uuid): Promise<ScoutCandidateDto[]> {
        const team = await this.teamRepo.findOneBy({ userId });
        if (!team) return [];
        const candidates = await this.scoutsService.getCandidates(team.id);
        return candidates.map(mapCandidateToDto);
    }

    /** Select a candidate → add to youth academy */
    @Post(':id/select')
    async selectCandidate(
        @Param('id') id: string,
        @CurrentUser('id') userId: Uuid,
    ): Promise<YouthPlayerDto> {
        const candidate = await this.scoutsService.selectCandidate(id);
        return mapYouthToDto(candidate);
    }

    /** Skip a candidate */
    @Post(':id/skip')
    async skipCandidate(
        @Param('id') id: string,
        @CurrentUser('id') userId: Uuid,
    ): Promise<{ success: boolean }> {
        await this.scoutsService.skipCandidate(id);
        return { success: true };
    }
}

// --- DTOs & Mappers ---

export interface ScoutCandidateDto {
    id: string;
    name: string;
    age: number;
    nationality: string;
    isGoalkeeper: boolean;
    potentialTier?: string;
    potentialRevealed: boolean;
    revealedSkills: RevealedSkillDto[];
    tendencyHint?: string;
}

export interface RevealedSkillDto {
    key: string;
    current: number;
    potential: number;
}

export interface YouthPlayerDto {
    id: string;
    name: string;
    age: number;
    birthday: string;
    nationality?: string;
    isGoalkeeper: boolean;
    potentialTier?: string;
    potentialRevealed: boolean;
    abilities?: string[];
    revealLevel: number;
    revealedSkills: string[];
    isPromoted: boolean;
    joinedAt: string;
}

function mapCandidateToDto(c: ScoutCandidateEntity): ScoutCandidateDto {
    const { playerData } = c;
    const allKeys = playerData.isGoalkeeper
        ? ['pace', 'strength', 'reflexes', 'handling', 'distribution', 'positioning', 'composure', 'freeKicks', 'penalties']
        : ['pace', 'strength', 'finishing', 'passing', 'dribbling', 'defending', 'positioning', 'composure', 'freeKicks', 'penalties'];

    const revealed = playerData.revealedSkills.map(key => ({
        key,
        current: extractSkill(playerData.currentSkills, key),
        potential: extractSkill(playerData.potentialSkills, key),
    }));

    const tendencyHint = buildTendencyHint(playerData);

    return {
        id: c.id,
        name: playerData.name,
        age: calcAge(playerData.birthday),
        nationality: playerData.nationality,
        isGoalkeeper: playerData.isGoalkeeper,
        potentialTier: playerData.potentialTier,
        potentialRevealed: playerData.potentialRevealed,
        revealedSkills: revealed,
        tendencyHint,
    };
}

function mapYouthToDto(y: YouthPlayerEntity): YouthPlayerDto {
    return {
        id: y.id,
        name: y.name,
        age: calcAge(y.birthday),
        birthday: y.birthday.toISOString(),
        nationality: y.nationality,
        isGoalkeeper: y.isGoalkeeper,
        potentialTier: y.potentialTier,
        potentialRevealed: y.potentialRevealed,
        abilities: y.abilities,
        revealLevel: y.revealLevel,
        revealedSkills: y.revealedSkills,
        isPromoted: y.isPromoted,
        joinedAt: y.joinedAt.toISOString(),
    };
}

function calcAge(birthday: Date): number {
    const diffMs = Date.now() - new Date(birthday).getTime();
    return Math.floor(diffMs / (1000 * 60 * 60 * 24 * 365.25) * 10) / 10;
}

function extractSkill(skills: any, key: string): number {
    if (!skills) return 0;
    for (const cat of Object.values(skills)) {
        if (cat && typeof cat === 'object' && key in cat) {
            return (cat as any)[key];
        }
    }
    return 0;
}

function buildTendencyHint(playerData: any): string {
    if (!playerData.currentSkills) return '未知';
    const cs = playerData.currentSkills;
    const phys = ((cs.physical?.pace ?? 0) + (cs.physical?.strength ?? 0)) / 2;
    const tech = Object.values(cs.technical as object).reduce((s: number, v: any) => s + (typeof v === 'number' ? v : 0), 0) /
        Object.keys(cs.technical as object).length;
    const ment = ((cs.mental?.positioning ?? 0) + (cs.mental?.composure ?? 0)) / 2;

    if (phys > tech && phys > ment) return '身体素质突出';
    if (tech > phys && tech > ment) return '技术能力出色';
    if (ment > phys && ment > tech) return '精神素质优异';
    return '综合均衡';
}
