import {
  PROMOTION_REVEAL_THRESHOLD,
  TeamEntity,
  Uuid,
  YouthPlayerEntity,
  currentGameDay,
  getYouthSkillKeys,
} from '@goalxi/database';
import {
  BadRequestException,
  Controller,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CurrentUser } from '../../decorators/current-user.decorator';
import { AuthGuard } from '../../guards/auth.guard';
import { YouthService } from './youth.service';

@Controller('youth-players')
@UseGuards(AuthGuard)
export class YouthController {
  constructor(
    private readonly youthService: YouthService,
    @InjectRepository(TeamEntity)
    private teamRepo: Repository<TeamEntity>,
  ) {}

  /** List youth players for current team */
  @Get()
  async list(@CurrentUser('id') userId: Uuid): Promise<YouthPlayerDto[]> {
    const team = await this.teamRepo.findOneBy({ userId });
    if (!team) return [];
    const players = await this.youthService.findByTeam(team.id);
    return players.map(mapYouthToDto);
  }

  /** Get single youth player */
  @Get(':id')
  async getOne(@Param('id') id: string): Promise<YouthPlayerDto> {
    const youth = await this.youthService.findOne(id);
    if (!youth) throw new BadRequestException('Youth player not found');
    return mapYouthToDto(youth);
  }

  /** Promote youth player to senior team */
  @Post(':id/promote')
  async promote(
    @Param('id') id: string,
    @CurrentUser('id') userId: Uuid,
  ): Promise<PlayerDto> {
    const youth = await this.youthService.findOne(id);
    if (!youth) throw new BadRequestException('Youth player not found');

    // [C1] Use the shared skill-key list as the single source of truth.
    // Previously this method hard-coded a 9-key GK list that mistakenly
    // included `distribution` (which doesn't exist for GK) instead of
    // `aerial`, causing the promotion gate to be unreachable for GKs.
    const expectedKeys = getYouthSkillKeys(youth.isGoalkeeper);
    const requiredCount = Math.ceil(
      expectedKeys.length * PROMOTION_REVEAL_THRESHOLD,
    );

    if (youth.revealedSkills.length < requiredCount) {
      throw new BadRequestException(
        `Player not yet fully scouted (need at least ${requiredCount} of ${expectedKeys.length} skills revealed)`,
      );
    }

    const player = await this.youthService.promote(id);
    return {
      id: player.id,
      name: player.name,
      teamId: player.teamId,
    };
  }
}

// --- DTOs & Mappers ---

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

export interface PlayerDto {
  id: string;
  name: string;
  teamId: string;
}

function mapYouthToDto(y: YouthPlayerEntity): YouthPlayerDto {
  return {
    id: y.id,
    name: y.name,
    age: calcAge(y.createdDay),
    createdDay: y.createdDay,
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

/** Age derived from `createdDay`: floor((currentGameDay - createdDay) / 112). */
function calcAge(createdDay: number): number {
  return Math.floor((currentGameDay() - createdDay) / 112);
}
