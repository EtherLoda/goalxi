import { TeamEntity, Uuid, YouthPlayerEntity } from '@goalxi/database';
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

    const keys = youth.isGoalkeeper
      ? [
          'pace',
          'strength',
          'reflexes',
          'handling',
          'distribution',
          'positioning',
          'composure',
          'freeKicks',
          'penalties',
        ]
      : [
          'pace',
          'strength',
          'finishing',
          'passing',
          'dribbling',
          'defending',
          'positioning',
          'composure',
          'freeKicks',
          'penalties',
        ];

    if (youth.revealedSkills.length < keys.length * 0.5) {
      throw new BadRequestException(
        'Player not yet fully scouted (need at least 50% skills revealed)',
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

export interface PlayerDto {
  id: string;
  name: string;
  teamId: string;
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
  return Math.floor((diffMs / (1000 * 60 * 60 * 24 * 365.25)) * 10) / 10;
}
