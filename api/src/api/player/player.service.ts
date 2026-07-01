import { OffsetPaginatedDto } from '@/common/dto/offset-pagination/paginated.dto';
import { Uuid } from '@/common/types/common.type';
import { isUuid } from '@/common/utils/is-uuid.util';
import { paginate } from '@/utils/offset-pagination';
import {
  PlayerEntity,
  PlayerSkills,
  PROMOTION_REVEAL_THRESHOLD,
  calculatePlayerPWI,
  displayIdFromUuid,
  formatDisplayId,
  formatPWI,
  getYouthSkillKeys,
  isValidDisplayId,
} from '@goalxi/database';
import {
  Injectable,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import assert from 'assert';
import { plainToInstance } from 'class-transformer';
import { v4 as uuidv4 } from 'uuid';
import {
  getRandomNameByNationality,
  getRandomNationality,
} from '../../constants/name-database';
import { CreatePlayerReqDto } from './dto/create-player.req.dto';
import { ListPlayerReqDto } from './dto/list-player.req.dto';
import { PlayerPublicResDto, PlayerResDto } from './dto/player.res.dto';
import { UpdatePlayerReqDto } from './dto/update-player.req.dto';

@Injectable()
export class PlayerService {
  constructor() {}

  async findMany(
    reqDto: ListPlayerReqDto,
  ): Promise<OffsetPaginatedDto<PlayerResDto | PlayerPublicResDto>> {
    const query = PlayerEntity.createQueryBuilder('player');

    const filters: any = {};
    if (reqDto.teamId) filters.teamId = reqDto.teamId;
    // [RFC 0001] ?isYouth=true filters to youth players. When omitted,
    // returns all (the old /youth-players endpoint behavior is merged
    // into this one).
    if (reqDto.isYouth !== undefined) filters.isYouth = reqDto.isYouth;

    if (Object.keys(filters).length > 0) {
      query.where(filters);
    }

    query.orderBy('player.createdAt', 'DESC');

    const [players, metaDto] = await paginate<PlayerEntity>(query, reqDto, {
      skipCount: false,
      takeAll: false,
    });

    const DtoClass = reqDto.detailed ? PlayerResDto : PlayerPublicResDto;

    return new OffsetPaginatedDto(
      players.map((player) => this.mapToResDto(player, DtoClass as any)),
      metaDto,
    );
  }

  async findOne(idOrDId: string): Promise<PlayerResDto> {
    assert(idOrDId, 'id is required');

    let player: PlayerEntity | null = null;
    if (isUuid(idOrDId)) {
      player = await PlayerEntity.findOneBy({ id: idOrDId as Uuid });
    } else if (isValidDisplayId(idOrDId)) {
      player = await PlayerEntity.findOneBy({ displayId: idOrDId });
    } else {
      throw new NotFoundException(
        'Invalid player identifier (expected UUID or 11-digit displayId)',
      );
    }

    if (!player) {
      throw new NotFoundException('Player not found');
    }

    return this.mapToResDto(player, PlayerResDto);
  }

  async create(reqDto: CreatePlayerReqDto): Promise<PlayerResDto> {
    const [currentSkills, potentialSkills] = this.generateRandomSkills(
      reqDto.isGoalkeeper || false,
    );

    const id = uuidv4();
    const displayId = formatDisplayId(displayIdFromUuid(id));

    const player = new PlayerEntity({
      id: id as Uuid,
      displayId,
      name: reqDto.name,
      nationality: reqDto.nationality,
      teamId: reqDto.teamId,
      createdDay: reqDto.createdDay,
      isGoalkeeper: reqDto.isGoalkeeper,
      currentSkills,
      potentialSkills,
      potentialAbility: reqDto.potentialAbility,
    });

    await player.save();

    return this.mapToResDto(player);
  }

  async update(id: Uuid, reqDto: UpdatePlayerReqDto): Promise<PlayerResDto> {
    assert(id, 'id is required');
    const player = await PlayerEntity.findOneByOrFail({ id });

    if (reqDto.name) player.name = reqDto.name;
    if (reqDto.nationality !== undefined)
      player.nationality = reqDto.nationality;
    if (reqDto.teamId !== undefined) player.teamId = reqDto.teamId;
    if (reqDto.createdDay !== undefined) player.createdDay = reqDto.createdDay;
    if (reqDto.isGoalkeeper !== undefined)
      player.isGoalkeeper = reqDto.isGoalkeeper;
    if (reqDto.onTransfer !== undefined) player.onTransfer = reqDto.onTransfer;
    if (reqDto.potentialAbility !== undefined)
      player.potentialAbility = reqDto.potentialAbility;

    await player.save();

    return this.mapToResDto(player);
  }

  async delete(id: Uuid): Promise<void> {
    assert(id, 'id is required');
    const player = await PlayerEntity.findOneByOrFail({ id });
    await player.softRemove();
  }

  /**
   * WAVE B2 — release a youth player from the academy. Distinct from
   * `delete()` (which soft-deletes any player, including senior
   * roster members): this method enforces `is_youth = true` so an
   * accidental call can never dump a contracted first-teamer.
   *
   * Idempotent enough for typical UX: caller hits "release" on a
   * youth they don't want, the row is soft-deleted (preserved for
   * transfer history / event log), and the youth_list query hides it.
   */
  async releaseYouth(id: Uuid): Promise<void> {
    const player = await PlayerEntity.findOneByOrFail({ id });
    if (!player.isYouth) {
      throw new BadRequestException(
        'Only youth players can be released; promote or use soft-delete for senior players',
      );
    }
    await player.softRemove();
  }

  /**
   * [RFC 0001] Promote a youth player to the senior squad.
   *
   * Gate: at least `ceil(PROMOTION_REVEAL_THRESHOLD * total_keys)` of
   * the player's skills must already be revealed. This is enforced
   * server-side — the comment's earlier "server-enforced" claim was
   * aspirational (the check was missing). Curl/Postman cannot promote
   * a 0-revealed youth any more.
   */
  async promote(id: Uuid): Promise<PlayerResDto> {
    const player = await PlayerEntity.findOneByOrFail({ id });
    if (!player.isYouth) {
      throw new BadRequestException('Player is not a youth player');
    }

    // ---- server-enforced reveal gate (WAVE B1) ----
    const totalKeys = getYouthSkillKeys(player.isGoalkeeper).length;
    const revealedCount = player.revealedSkills?.length ?? 0;
    const required = Math.ceil(PROMOTION_REVEAL_THRESHOLD * totalKeys);
    if (revealedCount < required) {
      throw new ForbiddenException(
        `Not enough skills revealed to promote: ${revealedCount}/${totalKeys} (need ≥ ${required})`,
      );
    }
    // -------------------------------------------------

    player.isYouth = false;
    player.revealLevel = 0;
    player.revealedSkills = [];
    player.potentialRevealed = true;
    // `youth_league_id` is irrelevant once senior; clear it.
    player.youthLeagueId = null;
    await player.save();
    return this.mapToResDto(player, PlayerResDto);
  }

  async generateRandom(
    count: number = 1,
    teamId?: string,
    nationality?: string,
  ): Promise<PlayerResDto[]> {
    const players: PlayerResDto[] = [];

    for (let i = 0; i < count; i++) {
      // Use provided nationality or generate random one
      const playerNationality = nationality || getRandomNationality();
      const { firstName, lastName } =
        getRandomNameByNationality(playerNationality);
      const isGoalkeeper = Math.random() < 0.1; // 10% chance to be a GK

      const [currentSkills, potentialSkills] =
        this.generateRandomSkills(isGoalkeeper);
      const potentialAbility = this.calculatePotentialAbility(potentialSkills);

      const id = uuidv4();
      const displayId = formatDisplayId(displayIdFromUuid(id));

      const player = new PlayerEntity({
        id: id as Uuid,
        displayId,
        name: `${firstName} ${lastName}`,
        nationality: playerNationality,
        teamId: teamId || null,
        isGoalkeeper,
        currentSkills,
        potentialSkills,
        potentialAbility,
      });

      await player.save();
      players.push(this.mapToResDto(player));
    }

    return players;
  }

  private generateRandomSkills(
    isGoalkeeper: boolean,
  ): [PlayerSkills, PlayerSkills] {
    const rand = (min: number, max: number) =>
      Number((Math.random() * (max - min) + min).toFixed(2));

    // Helper to create attribute sets for each category
    const createPhysical = () => ({
      pace: rand(isGoalkeeper ? 5 : 10, 20),
      strength: rand(5, 20),
    });

    const createTechnicalGK = () => ({
      reflexes: rand(10, 20),
      handling: rand(10, 20),
      aerial: rand(5, 18),
      positioning: rand(10, 20),
    });

    const createTechnicalOutfield = () => ({
      finishing: rand(5, 20),
      passing: rand(5, 20),
      dribbling: rand(5, 20),
      defending: rand(5, 20),
    });

    const createMental = () => ({
      vision: rand(5, 20),
      positioning: rand(5, 20),
      awareness: rand(5, 20),
      composure: rand(5, 20),
      aggression: rand(5, 20),
    });

    const currentPhysical = createPhysical();
    const currentTechnical = isGoalkeeper
      ? createTechnicalGK()
      : createTechnicalOutfield();
    const currentMental = createMental();

    // Potential values start as a copy of current then possibly increase
    const potentialPhysical = { ...currentPhysical };
    const potentialTechnical = { ...currentTechnical };
    const potentialMental = { ...currentMental };

    // Randomly increase potential values
    (
      Object.keys(potentialPhysical) as Array<keyof typeof potentialPhysical>
    ).forEach((key) => {
      potentialPhysical[key] = Math.max(
        potentialPhysical[key],
        currentPhysical[key] + rand(0, 5),
      );
    });

    const pTech = potentialTechnical as Record<string, number>;
    const cTech = currentTechnical as Record<string, number>;
    Object.keys(pTech).forEach((key) => {
      pTech[key] = Math.max(pTech[key], cTech[key] + rand(0, 5));
    });

    (
      Object.keys(potentialMental) as Array<keyof typeof potentialMental>
    ).forEach((key) => {
      potentialMental[key] = Math.max(
        potentialMental[key],
        currentMental[key] + rand(0, 5),
      );
    });

    const currentSkills: PlayerSkills = {
      physical: currentPhysical,
      technical: currentTechnical,
      mental: currentMental,
      setPieces: { freeKicks: 10, penalties: 10 },
    };

    const potentialSkills: PlayerSkills = {
      physical: potentialPhysical,
      technical: potentialTechnical,
      mental: potentialMental,
      setPieces: { freeKicks: 10, penalties: 10 },
    };

    return [currentSkills, potentialSkills];
  }

  private calculateOverall(skills: PlayerSkills): number {
    if (!skills) return 0;
    let total = 0;
    let count = 0;

    for (const cat of Object.values(skills)) {
      for (const val of Object.values(cat)) {
        total += val as number;
        count++;
      }
    }

    return count > 0 ? Math.round((total / count) * 5) : 0; // Scale to 0-100 roughly (avg * 5 as max is 20)
  }

  /**
   * Calculate potential ability from potential skills
   * Formula: PA = (Σ physical + Σ technical) × 1 + Σ mental × 0.4 + Σ setPieces × 0.1
   * Normalized to 0-100
   */
  private calculatePotentialAbility(skills: PlayerSkills): number {
    if (!skills) return 50;
    const physical = skills.physical as unknown as Record<string, number>;
    const technical = skills.technical as unknown as Record<string, number>;
    const mental = skills.mental as unknown as Record<string, number>;
    const setPieces = skills.setPieces as unknown as Record<string, number>;

    const physicalSum = Object.values(physical).reduce((a, b) => a + b, 0);
    const technicalSum = Object.values(technical).reduce((a, b) => a + b, 0);
    const mentalSum = Object.values(mental).reduce((a, b) => a + b, 0);
    const setPiecesSum = Object.values(setPieces).reduce((a, b) => a + b, 0);

    const rawPA =
      physicalSum * 1 + technicalSum * 1 + mentalSum * 0.4 + setPiecesSum * 0.1;

    // Normalize to 0-100 (max raw for outfield: 6*20 + 4*20*0.4 + 2*20*0.1 = 140)
    const maxRaw = 140;
    return Math.min(100, Math.max(0, Math.round((rawPA / maxRaw) * 100)));
  }

  private mapToResDto(player: PlayerEntity, DtoClass: any = PlayerResDto): any {
    const [years, days] = player.getExactAge();
    const pwiResult = calculatePlayerPWI(player);
    return plainToInstance(DtoClass, {
      id: player.id,
      displayId: player.displayId,
      teamId: player.teamId,
      name: player.name,
      nationality: player.nationality,
      createdDay: player.createdDay,
      isYouth: player.isYouth,
      age: years,
      ageDays: days,
      isGoalkeeper: player.isGoalkeeper,
      position: player.position ?? null,
      overall: pwiResult.pwi,
      pwi: pwiResult.pwi,
      pwiDisplay: formatPWI(pwiResult.pwi),
      onTransfer: player.onTransfer,
      specialty: player.specialty,
      currentSkills: player.currentSkills,
      potentialSkills: player.potentialSkills,
      potentialAbility: player.potentialAbility,
      experience: player.experience,
      form: player.form,
      stamina: player.stamina,
      currentWage: player.currentWage,
      createdAt: player.createdAt,
      updatedAt: player.updatedAt,
    });
  }
}
