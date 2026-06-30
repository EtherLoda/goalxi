import {
  currentGameDay,
  ScoutCandidateEntity,
  TeamEntity,
  Uuid,
  PlayerEntity,
  getYouthSkillKeys,
} from '@goalxi/database';
import { Controller, ForbiddenException, Get, Param, Post, UseGuards } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CurrentUser } from '../../decorators/current-user.decorator';
import { AuthGuard } from '../../guards/auth.guard';
import { ScoutsService } from './scouts.service';

@Controller({ path: 'scouts', version: '1' })
@UseGuards(AuthGuard)
export class ScoutsController {
  constructor(
    private readonly scoutsService: ScoutsService,
    @InjectRepository(TeamEntity)
    private teamRepo: Repository<TeamEntity>,
  ) {}

  /** Get current team's scout candidates */
  @Get('candidates')
  async getCandidates(
    @CurrentUser('id') userId: Uuid,
  ): Promise<ScoutCandidateDto[]> {
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
    // [S2] Verify ownership BEFORE delegating to the service. Previously
    // any authenticated user could select any candidate by ID, even ones
    // belonging to other teams.
    const team = await this.teamRepo.findOneBy({ userId });
    if (!team) {
      throw new ForbiddenException('You do not own a team');
    }
    const candidate = await this.scoutsService.selectCandidate(id, team.id);
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
  createdDay: number;
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

  const revealed = playerData.revealedSkills.map((key) => ({
    key,
    current: extractSkill(playerData.currentSkills, key),
    potential: extractSkill(playerData.potentialSkills, key),
  }));

  const tendencyHint = buildTendencyHint(playerData);

  return {
    id: c.id,
    name: playerData.name,
    age: calcAge(playerData.createdDay),
    nationality: playerData.nationality,
    isGoalkeeper: playerData.isGoalkeeper,
    potentialTier: playerData.potentialTier,
    potentialRevealed: playerData.potentialRevealed,
    revealedSkills: revealed,
    tendencyHint,
  };
}

function mapYouthToDto(y: PlayerEntity): YouthPlayerDto {
  // After RFC 0001 there is no separate YouthPlayerEntity; the player
  // is a PlayerEntity row with `isYouth = true`. We translate the
  // shape into the youth DTO (kept for frontend compatibility).
  return {
    id: y.id,
    name: y.name,
    age: calcAge(y.createdDay),
    createdDay: y.createdDay,
    nationality: y.nationality,
    isGoalkeeper: y.isGoalkeeper,
    // [RFC 0001] `potential_tier` was removed from `player` in migration
    // 1718000000000. We derive the tier from `potentialAbility` so the
    // frontend keeps working without an extra DB column.
    potentialTier: derivePotentialTier(y.potentialAbility),
    potentialRevealed: y.potentialRevealed,
    abilities:
      (y.currentSkills as any)?.abilities ?? undefined,
    revealLevel: y.revealLevel,
    revealedSkills: y.revealedSkills,
    isPromoted: false,
    joinedAt: y.createdAt
      ? new Date(y.createdAt as any).toISOString()
      : new Date().toISOString(),
  };
}

function derivePotentialTier(pa: number): string {
  if (pa >= 91) return 'LEGEND';
  if (pa >= 81) return 'ELITE';
  if (pa >= 71) return 'HIGH_PRO';
  if (pa >= 56) return 'REGULAR';
  return 'LOW';
}

/** Age derived from `createdDay`: floor((currentGameDay - createdDay) / 112). */
function calcAge(createdDay: number): number {
  return Math.floor((currentGameDay() - createdDay) / 112);
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
  const tech =
    Object.values(cs.technical as object).reduce(
      (s: number, v: any) => s + (typeof v === 'number' ? v : 0),
      0,
    ) / Object.keys(cs.technical as object).length;
  const ment =
    ((cs.mental?.positioning ?? 0) + (cs.mental?.composure ?? 0)) / 2;

  if (phys > tech && phys > ment) return '身体素质突出';
  if (tech > phys && tech > ment) return '技术能力出色';
  if (ment > phys && ment > tech) return '精神素质优异';
  return '综合均衡';
}
