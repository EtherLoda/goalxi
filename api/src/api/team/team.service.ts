import { OffsetPaginatedDto } from '@/common/dto/offset-pagination/paginated.dto';
import { Uuid } from '@/common/types/common.type';
import { isUuid } from '@/common/utils/is-uuid.util';
import { ErrorCode } from '@/constants/error-code.constant';
import {
  getRandomNameByNationality,
  getRandomNationality,
} from '@/constants/name-database';
import { ValidationException } from '@/exceptions/validation.exception';
import { paginate } from '@/utils/offset-pagination';
import {
  BenchConfig,
  generateUniqueShortCode,
  isValidShortCode,
  LeagueEntity,
  normalizeShortCode,
  StaffEntity,
  StaffLevel,
  StaffRole,
  TeamEntity,
} from '@goalxi/database';
import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import assert from 'assert';
import { plainToInstance } from 'class-transformer';
import { Repository } from 'typeorm';
import { CreateTeamReqDto } from './dto/create-team.req.dto';
import { ListTeamReqDto } from './dto/list-team.req.dto';
import { TeamResDto } from './dto/team.res.dto';
import { UpdateTeamReqDto } from './dto/update-team.req.dto';

import { PlayerEntity } from '@goalxi/database';
import { PlayerService } from '../player/player.service';
import { ScoutsService } from '../scouts/scouts.service';

@Injectable()
export class TeamService {
  private readonly logger = new Logger(TeamService.name);

  constructor(
    private readonly playerService: PlayerService,
    @InjectRepository(StaffEntity)
    private readonly staffRepo: Repository<StaffEntity>,
    private readonly scoutsService: ScoutsService,
  ) {}

  async findMany(
    reqDto: ListTeamReqDto,
  ): Promise<OffsetPaginatedDto<TeamResDto>> {
    const query = TeamEntity.createQueryBuilder('team').orderBy(
      'team.createdAt',
      'DESC',
    );
    const [teams, metaDto] = await paginate<TeamEntity>(query, reqDto, {
      skipCount: false,
      takeAll: false,
    });

    return new OffsetPaginatedDto(
      teams.map((team) => this.mapToResDto(team)),
      metaDto,
    );
  }

  async findOne(idOrCode: string): Promise<TeamResDto> {
    assert(idOrCode, 'id is required');

    const team = await this.resolveTeam(idOrCode);

    // Auto-generate players if team has none (e.g. for existing teams before this logic)
    const playersCount = await PlayerEntity.countBy({ teamId: team.id });
    if (playersCount === 0) {
      await this.playerService.generateRandom(18, team.id, team.nationality);
    }

    return this.mapToResDto(team);
  }

  /**
   * Resolve a path parameter that may carry either a UUID or a 5-char short code.
   * Throws ValidationException if neither format is recognized.
   */
  private async resolveTeam(idOrCode: string): Promise<TeamEntity> {
    if (isUuid(idOrCode)) {
      return TeamEntity.findOneByOrFail({ id: idOrCode as Uuid });
    }
    if (isValidShortCode(idOrCode)) {
      const team = await TeamEntity.findOneBy({
        shortCode: normalizeShortCode(idOrCode),
      });
      if (team) {
        return team;
      }
    }
    throw new ValidationException(
      ErrorCode.E002,
      'Invalid team identifier (expected UUID or 5-char short code)',
    );
  }

  async findByUserId(userId: Uuid): Promise<TeamResDto | null> {
    assert(userId, 'userId is required');
    const team = await TeamEntity.findOneBy({ userId });

    return team ? this.mapToResDto(team) : null;
  }

  /**
   * Cheap ownership probe — used by the controller to gate
   * `PATCH /teams/:id` so a logged-in user can no longer rename
   * another manager's team. We deliberately do not hydrate the
   * full team row here; the controller follows up with
   * `update(id, ...)` which loads it again. A two-query
   * ownership check + update is fine for an endpoint that
   * fires at most once per onboarding flow.
   */
  async isOwnedBy(teamId: Uuid, userId: Uuid): Promise<boolean> {
    assert(teamId, 'teamId is required');
    assert(userId, 'userId is required');
    const team = await TeamEntity.findOne({
      where: { id: teamId },
      select: { id: true, userId: true },
    });
    return team?.userId === userId;
  }

  /**
   * Update the team owned by the given user. Resolves the
   * teamId from `userId` so the caller (typically the
   * post-onboarding "name your club" form) doesn't have to
   * know its own teamId.
   *
   * Throws ValidationException(E001) if the user has no team
   * yet — should never happen for a manager who has finished
   * the onboarding flow, but a defensive 404 keeps the API
   * honest if a future migration splits the user/team row
   * creation.
   */
  async updateByUserId(
    userId: Uuid,
    reqDto: UpdateTeamReqDto,
  ): Promise<TeamResDto> {
    assert(userId, 'userId is required');
    const team = await TeamEntity.findOne({
      where: { userId },
      select: { id: true },
    });
    if (!team) {
      throw new ValidationException(
        ErrorCode.E002,
        'User does not own a team yet',
      );
    }
    return this.update(team.id, reqDto);
  }

  async create(reqDto: CreateTeamReqDto): Promise<TeamResDto> {
    // Check if user already has a team (one-to-one relationship)
    const existingTeam = await TeamEntity.findOneBy({ userId: reqDto.userId });
    if (existingTeam) {
      throw new ValidationException(ErrorCode.E001, 'User already has a team');
    }

    // Generate a unique short code (5 chars, ambiguous chars excluded)
    const shortCode = await generateUniqueShortCode(async (code) => {
      const hit = await TeamEntity.findOne({
        where: { shortCode: code },
        select: { id: true },
      });
      return hit !== null;
    });

    const team = new TeamEntity({
      userId: reqDto.userId,
      name: reqDto.name,
      shortCode,
      nationality: reqDto.nationality,
      leagueId: reqDto.leagueId || null,
      logoUrl: reqDto.logoUrl || '',
      jerseyColorPrimary: reqDto.jerseyColorPrimary || '#FF0000',
      jerseyColorSecondary: reqDto.jerseyColorSecondary || '#FFFFFF',
      jerseyColorTertiary: reqDto.jerseyColorTertiary || '#000000',
      foundedYear: reqDto.foundedYear ?? null,
      city: reqDto.city ?? null,
      bio: reqDto.bio ?? null,
    });

    await team.save();

    // Initialize team with a starting squad of 18 players
    // Use team's nationality for player generation to create cohesive squads
    await this.playerService.generateRandom(18, team.id, team.nationality);

    // Create default Level 2 head coach
    const nationality = team.nationality || getRandomNationality();
    const { firstName, lastName } = getRandomNameByNationality(nationality);
    const headCoach = this.staffRepo.create({
      teamId: team.id,
      name: `${firstName} ${lastName}`,
      role: StaffRole.HEAD_COACH,
      level: StaffLevel.LEVEL_2,
      salary: 4000,
      contractExpiry: new Date(Date.now() + 16 * 7 * 24 * 60 * 60 * 1000),
      autoRenew: true,
      isActive: true,
      nationality,
    });
    await this.staffRepo.save(headCoach);

    // Create default Level 2 fitness coach
    const { firstName: fitFirst, lastName: fitLast } =
      getRandomNameByNationality(nationality);
    const fitnessCoach = this.staffRepo.create({
      teamId: team.id,
      name: `${fitFirst} ${fitLast}`,
      role: StaffRole.FITNESS_COACH,
      level: StaffLevel.LEVEL_2,
      salary: 2000,
      contractExpiry: new Date(Date.now() + 16 * 7 * 24 * 60 * 60 * 1000),
      autoRenew: true,
      isActive: true,
      nationality,
    });
    await this.staffRepo.save(fitnessCoach);

    // [Onboarding] Seed the first scout candidate so a new manager
    // sees something in the inbox without waiting for the weekly
    // Saturday cron. Best-effort — the call is idempotent (server
    // enforces the week-end expiry window, and the inbox UX pulls
    // one card at a time on demand thereafter).
    try {
      await this.scoutsService.generateOneCandidate(team.id);
    } catch (err) {
      // Was `console.warn` — moved to the structured logger so
      // the line lands in the central pino sink with the same
      // traceId as the team.create request that triggered it.
      this.logger.warn(
        `[TeamService.create] Failed to seed initial scout candidates for team ${team.id}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }

    return this.mapToResDto(team);
  }

  async update(id: Uuid, reqDto: UpdateTeamReqDto): Promise<TeamResDto> {
    assert(id, 'id is required');
    const team = await TeamEntity.findOneByOrFail({ id });

    if (reqDto.name) team.name = reqDto.name;
    if (reqDto.nationality !== undefined) team.nationality = reqDto.nationality;
    if (reqDto.leagueId !== undefined) team.leagueId = reqDto.leagueId || null;
    if (reqDto.logoUrl !== undefined) team.logoUrl = reqDto.logoUrl;
    if (reqDto.jerseyColorPrimary)
      team.jerseyColorPrimary = reqDto.jerseyColorPrimary;
    if (reqDto.jerseyColorSecondary)
      team.jerseyColorSecondary = reqDto.jerseyColorSecondary;
    if (reqDto.jerseyColorTertiary)
      team.jerseyColorTertiary = reqDto.jerseyColorTertiary;
    if (reqDto.foundedYear !== undefined)
      team.foundedYear = reqDto.foundedYear ?? null;
    if (reqDto.city !== undefined) team.city = reqDto.city ?? null;
    if (reqDto.bio !== undefined) team.bio = reqDto.bio ?? null;
    if (reqDto.staminaTrainingIntensity !== undefined) {
      // §5.4: at most one training-intensity change per real-world
      // week. The check is on the server, not just the client
      // (TrainingSlider.tsx has the matching UI gate) — anything else
      // is bypassable with a curl. The 7-day window matches the
      // `WEEK_MS` constant in TrainingSlider so the two stay in sync.
      assertTrainingIntensityChangeAllowed(
        team.trainingIntensityLastChangedAt,
        team.staminaTrainingIntensity,
        reqDto.staminaTrainingIntensity,
      );
      team.staminaTrainingIntensity = reqDto.staminaTrainingIntensity;
      // §5.4: reset the weekly change timer on every training intensity update
      team.trainingIntensityLastChangedAt = new Date();
    }

    await team.save();

    return this.mapToResDto(team);
  }

  async updateBenchConfig(
    id: Uuid,
    benchConfig: BenchConfig,
  ): Promise<TeamResDto> {
    assert(id, 'id is required');
    const team = await TeamEntity.findOneByOrFail({ id });

    team.benchConfig = benchConfig;
    await team.save();

    return this.mapToResDto(team);
  }

  async delete(id: Uuid): Promise<void> {
    assert(id, 'id is required');
    const team = await TeamEntity.findOneByOrFail({ id });
    await team.softRemove();
  }

  /**
   * (Removed from HTTP surface) List BOT teams available for
   * takeover. Kept here as a private helper for future admin
   * tooling; the onboarding flow no longer exposes this list
   * to end users.
   *
   * If you re-introduce a route for this, route it through
   * AuthGuard + RolesGuard(ADMIN) and consider whether the
   * `lowestTier`-only filter still makes sense (the new
   * algorithm fills ANY league up to 50% before round-robin).
   */
  private async listAvailableBotTeams(
    leagueId?: string,
  ): Promise<TeamResDto[]> {
    // Find the maximum tier (lowest league level)
    const maxTierResult = await LeagueEntity.createQueryBuilder('league')
      .select('MAX(league.tier)', 'maxTier')
      .getRawOne();
    const lowestTier = maxTierResult?.maxTier || 4;

    const query = TeamEntity.createQueryBuilder('team')
      .leftJoinAndSelect('team.league', 'league')
      .where('team.isBot = :isBot', { isBot: true })
      .andWhere('team.leagueId IS NOT NULL')
      .andWhere('league.tier = :lowestTier', { lowestTier });

    if (leagueId) {
      query.andWhere('team.leagueId = :leagueId', { leagueId });
    }

    const teams = await query.getMany();
    return teams.map((team) => this.mapToResDto(team));
  }

  /**
   * (Removed) Apply to take over a BOT team.
   *
   * The HTTP route `POST /teams/:id/apply` was @Public() and
   * took a `userId` in the body — a deliberate "any caller can
   * gift a BOT to any user" hole. The replacement is
   * `POST /onboarding/claim` (see
   * `api/src/api/onboarding/`), which is auth-gated, runs
   * asynchronously, and uses the JWT identity.
   *
   * If a future admin tool ever needs an explicit synchronous
   * takeover, re-introduce it with `@UseGuards(AuthGuard)` and
   * a `RolesGuard` check for `UserRole.ADMIN`. The mechanism
   * underneath should be `OnboardingAssigner.claim(dataSource,
   * userId)` from `@goalxi/database`, not a hand-rolled
   * assignment like the old body of this method — that is
   * why no replacement is left here.
   */

  private mapToResDto(team: TeamEntity): TeamResDto {
    return plainToInstance(TeamResDto, {
      id: team.id,
      userId: team.userId,
      leagueId: team.leagueId,
      name: team.name,
      shortCode: team.shortCode,
      nationality: team.nationality,
      logoUrl: team.logoUrl,
      jerseyColorPrimary: team.jerseyColorPrimary,
      jerseyColorSecondary: team.jerseyColorSecondary,
      jerseyColorTertiary: team.jerseyColorTertiary,
      foundedYear: team.foundedYear,
      city: team.city,
      bio: team.bio,
      benchConfig: team.benchConfig,
      staminaTrainingIntensity: team.staminaTrainingIntensity,
      trainingIntensityLastChangedAt: team.trainingIntensityLastChangedAt,
      createdAt: team.createdAt,
      updatedAt: team.updatedAt,
    });
  }
}

// ---------- §5.4 weekly-intensity cooldown helper ----------

/** Cooldown window in milliseconds — must match TrainingSlider.tsx WEEK_MS. */
const TRAINING_INTENSITY_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Enforce §5.4: training intensity can change at most once per
 * real-world week. The check is exported as a pure function so it
 * can be unit-tested without spinning up a full TypeORM context.
 *
 * Rules:
 *   - If `lastChangedAt` is null, the team has never tuned intensity
 *     before — the very first write goes through.
 *   - If the new value equals the current value, this is a no-op
 *     and the cooldown does not apply (so the UI can re-submit
 *     without the user actually changing anything).
 *   - Otherwise, the call must land AFTER the cooldown window.
 */
export function assertTrainingIntensityChangeAllowed(
  lastChangedAt: Date | null | undefined,
  currentValue: number,
  newValue: number,
  now: Date = new Date(),
): void {
  if (!lastChangedAt) return;
  if (currentValue === newValue) return;
  if (
    now.getTime() - new Date(lastChangedAt).getTime() >=
    TRAINING_INTENSITY_COOLDOWN_MS
  ) {
    return;
  }
  throw new BadRequestException(
    'Training intensity can only be changed once per week. Wait until the cooldown ends.',
  );
}
