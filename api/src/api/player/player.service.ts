import { OffsetPaginatedDto } from '@/common/dto/offset-pagination/paginated.dto';
import { paginate } from '@/utils/offset-pagination';
import {
  calculatePlayerPWI,
  calculatePotentialAbility,
  formatPWI,
  getYouthSkillKeys,
  PlayerEntity,
  PlayerSkills,
  PROMOTION_REVEAL_THRESHOLD,
} from '@goalxi/database';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import assert from 'assert';
import { plainToInstance } from 'class-transformer';
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

  async findOne(id: string): Promise<PlayerResDto> {
    assert(id, 'id is required');

    const numericId = parseInt(id, 10);
    if (isNaN(numericId)) {
      throw new NotFoundException('Invalid player ID (expected numeric)');
    }

    const player = await PlayerEntity.findOneBy({ id: numericId });
    if (!player) {
      throw new NotFoundException('Player not found');
    }

    return this.mapToResDto(player, PlayerResDto);
  }

  async create(reqDto: CreatePlayerReqDto): Promise<PlayerResDto> {
    const [currentSkills, potentialSkills] = this.generateRandomSkills(
      reqDto.isGoalkeeper || false,
    );

    const player = new PlayerEntity({
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

  async update(id: number, reqDto: UpdatePlayerReqDto): Promise<PlayerResDto> {
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

  async delete(id: number): Promise<void> {
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
  async releaseYouth(id: number): Promise<void> {
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
   * ⛔ **FROZEN SUBSYSTEM.** Youth development is paused indefinitely —
   * see the "Youth Pipeline" section of `CLAUDE.md`. Do not extend,
   * remove, or "fix" this gate without an explicit go-ahead from the
   * maintainer.
   *
   * In particular, this gate looks like over-restrictive validation
   * that a reasonable person would relax. It is load-bearing:
   *
   *  - It is the ONLY thing preventing a raw client (curl/Postman) from
   *    promoting a 0-revealed youth straight to the senior squad. The
   *    FE's own checks are cosmetic.
   *  - It cannot be relaxed by special-casing. `revealedSkills` is
   *    populated exclusively by `YouthProgressionProcessor`, which
   *    skips `!player.teamId` rows — so a team-less youth has
   *    `revealedSkills = []` permanently and can never pass. Loosening
   *    the threshold for "team-less" players is exactly the bypass
   *    WAVE B1 exists to close.
   *
   * See *Known limitations* in `CLAUDE.md` → "The promotion gate can
   * never be satisfied for a team-less youth" for why this is left as
   * defensive dead code rather than repaired.
   *
   * Gate: at least `ceil(PROMOTION_REVEAL_THRESHOLD * total_keys)` of
   * the player's skills must already be revealed. Enforced server-side
   * before any state mutation.
   */
  async promote(id: number): Promise<PlayerResDto> {
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
      const potentialAbility = calculatePotentialAbility(
        potentialSkills,
        isGoalkeeper,
      );

      const player = new PlayerEntity({
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

  private mapToResDto(player: PlayerEntity, DtoClass: any = PlayerResDto): any {
    const [years, days] = player.getExactAge();
    const pwiResult = calculatePlayerPWI(player);
    return plainToInstance(DtoClass, {
      id: player.id,
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
      // Legacy v1 specialty — kept for the migration window. New
      // callers should read `coreSpecialty` + `coreSpecialtyTier`
      // instead. The P7 migration script overwrites `specialty`
      // with the v2 code (matching `coreSpecialty`).
      specialty: player.specialty,
      // v2 — primary path.
      coreSpecialty: player.coreSpecialty ?? null,
      coreSpecialtyTier: player.coreSpecialtyTier ?? 'BRONZE',
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
