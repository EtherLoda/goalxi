import { Uuid } from '@/common/types/common.type';
import {
  FinanceEntity,
  MatchEntity,
  STADIUM_CONSTRUCTION_MAX_SEATS_PER_JOB,
  STADIUM_CONSTRUCTION_MIN_SEATS,
  STADIUM_COST_PER_SEAT,
  STADIUM_MAX_LEVEL,
  STADIUM_MIN_CAPACITY,
  StadiumConstructionEntity,
  StadiumConstructionKind,
  StadiumConstructionStatus,
  StadiumEntity,
  TeamEntity,
  TransactionEntity,
  TransactionType,
  computeConstructionWeeks,
  computeDemolishWeeks,
  stadiumCapacityCap,
  stadiumUpgradeCost,
  stadiumUpgradeWeeks,
} from '@goalxi/database';
import { LOGGER_SERVICE, PinoLoggerService } from '@goalxi/logger';
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { assertTeamOwner } from './assert-team-owner';

/**
 * §5 Stadium — Time-based construction queue (api side).
 *
 * Owns the user-facing lifecycle:
 *   - `start`      — manager-initiated via the dialog; charges funds for
 *                    EXPAND inside a single DB tx together with the row
 *                    insert so the two commit atomically. DEMOLISH skips
 *                    the finance side — the refund is paid by the
 *                    settlement processor on completion.
 *   - `listForTeam` — read-only view used by the Stadium page.
 *
 * The weekly tick (decrement `remainingWeeks`, apply capacity, refund, notify)
 * lives in `settlement/src/processors/stadium-construction.processor.ts` — the
 * two microservices share the database but not TypeScript code.
 *
 * Concurrency rule: one IN_PROGRESS row per team. Trying to start a second
 * project while one is in flight returns 409 — keeps capacity math race-free
 * without needing row locks.
 */
@Injectable()
export class StadiumConstructionService {
  constructor(
    @Inject(LOGGER_SERVICE)
    private readonly logger: PinoLoggerService,
    @InjectRepository(StadiumConstructionEntity)
    private readonly constructionRepo: Repository<StadiumConstructionEntity>,
    @InjectRepository(StadiumEntity)
    private readonly stadiumRepo: Repository<StadiumEntity>,
    @InjectRepository(MatchEntity)
    private readonly matchRepo: Repository<MatchEntity>,
    @InjectRepository(TeamEntity)
    private readonly teamRepo: Repository<TeamEntity>,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  /**
   * Queue a new expand or demolish project. Returns the persisted row and
   * computed weeks for the UI to show "completes in N weeks".
   */
  async start(
    teamId: string,
    kind: StadiumConstructionKind,
    delta: number,
    userId: string,
  ): Promise<{
    construction: StadiumConstructionEntity;
    weeks: number;
    cost: number;
  }> {
    const teamUuid = teamId as Uuid;
    await assertTeamOwner(this.teamRepo, teamId, userId);
    this.validateDelta(delta);

    const stadium = await this.stadiumRepo.findOne({
      where: { teamId: teamUuid },
    });
    if (!stadium) {
      throw new NotFoundException(`Stadium not found for team ${teamId}`);
    }

    if (kind === StadiumConstructionKind.EXPAND) {
      // The ceiling is the stadium's own level, not a global constant: a
      // level is a permission to hold seats, so it is the only thing that
      // can authorise a bigger ground.
      const cap = stadiumCapacityCap(stadium.level ?? 1);
      if (stadium.capacity + delta > cap) {
        throw new BadRequestException(
          `Cannot expand past ${cap.toLocaleString()} seats at level ${stadium.level ?? 1}`,
        );
      }
    } else {
      if (stadium.capacity - delta < STADIUM_MIN_CAPACITY) {
        throw new BadRequestException(
          `Stadium must keep at least ${STADIUM_MIN_CAPACITY.toLocaleString()} seats`,
        );
      }
    }

    const existing = await this.constructionRepo.findOne({
      where: {
        teamId: teamUuid,
        status: StadiumConstructionStatus.IN_PROGRESS,
      },
    });
    if (existing) {
      throw new ConflictException(
        `Team ${teamId} already has a construction in progress`,
      );
    }

    const weeks =
      kind === StadiumConstructionKind.EXPAND
        ? computeConstructionWeeks(delta)
        : computeDemolishWeeks(delta);
    const cost = delta * STADIUM_COST_PER_SEAT;
    const endingCapacity =
      kind === StadiumConstructionKind.EXPAND
        ? stadium.capacity + delta
        : stadium.capacity - delta;

    const { season, week } = await this.getCurrentSeasonAndWeek();

    // EXPAND: deduct funds immediately inside one DB tx together with the
    // construction row insert so the two commit atomically. DEMOLISH: no
    // money movement at queue time — the refund is paid by the settlement
    // processor on completion.
    const construction = await this.dataSource.transaction(async (manager) => {
      const constructionRepo = manager.getRepository(StadiumConstructionEntity);
      const created = constructionRepo.create({
        teamId,
        kind,
        deltaSeats: delta,
        startingCapacity: stadium.capacity,
        endingCapacity,
        totalWeeks: weeks,
        remainingWeeks: weeks,
        cost,
        refund: 0,
        status: StadiumConstructionStatus.IN_PROGRESS,
        seasonStarted: season,
        weekStarted: week,
      });
      const saved = await constructionRepo.save(created);

      if (kind === StadiumConstructionKind.EXPAND) {
        const financeRepo = manager.getRepository(FinanceEntity);
        const transactionRepo = manager.getRepository(TransactionEntity);
        const finance = await financeRepo.findOne({
          where: { teamId: teamUuid },
        });
        if (!finance) {
          throw new NotFoundException(
            `Finance record not found for team ${teamId}`,
          );
        }
        finance.balance -= cost;
        await financeRepo.save(finance);
        await transactionRepo.save(
          transactionRepo.create({
            teamId,
            amount: -cost,
            type: TransactionType.OTHER_EXPENSE,
            season,
            week,
            description: `Stadium expansion queued (+${delta.toLocaleString()} → ${endingCapacity.toLocaleString()})`,
            relatedId: saved.id,
          }),
        );
      }

      return saved;
    });

    this.logger.info(
      `Stadium ${kind.toLowerCase()} queued for team ${teamId}: ${delta} seats over ${weeks} weeks`,
    );

    return { construction, weeks, cost };
  }

  /**
   * Queue a stadium level upgrade.
   *
   * Adds no seats. It only raises `stadiumCapacityCap(level)`, i.e. the
   * permission to hold a bigger ground later — the level itself earns
   * nothing, which is what keeps an established club from compounding a
   * revenue edge it never has to defend.
   *
   * Money is debited at queue time exactly like EXPAND so the two paths
   * cannot diverge, and the project shares the "one at a time" rule with
   * `start()`, so an upgrade competes with expansion for the same queue
   * slot instead of running alongside it.
   */
  async upgrade(
    teamId: string,
    userId: string,
  ): Promise<{
    construction: StadiumConstructionEntity;
    weeks: number;
    cost: number;
  }> {
    const teamUuid = teamId as Uuid;
    await assertTeamOwner(this.teamRepo, teamId, userId);

    const stadium = await this.stadiumRepo.findOne({
      where: { teamId: teamUuid },
    });
    if (!stadium) {
      throw new NotFoundException(`Stadium not found for team ${teamId}`);
    }

    const currentLevel = stadium.level ?? 1;
    if (currentLevel >= STADIUM_MAX_LEVEL) {
      throw new BadRequestException(
        `Stadium is already at level ${STADIUM_MAX_LEVEL}`,
      );
    }

    const targetLevel = currentLevel + 1;
    const cost = stadiumUpgradeCost(targetLevel);
    const weeks = stadiumUpgradeWeeks(targetLevel);
    if (cost === null || weeks === null) {
      throw new BadRequestException(
        `Level ${targetLevel} is not purchasable`,
      );
    }

    const existing = await this.constructionRepo.findOne({
      where: {
        teamId: teamUuid,
        status: StadiumConstructionStatus.IN_PROGRESS,
      },
    });
    if (existing) {
      throw new ConflictException(
        `Team ${teamId} already has a construction in progress`,
      );
    }

    const { season, week } = await this.getCurrentSeasonAndWeek();

    const construction = await this.dataSource.transaction(async (manager) => {
      const constructionRepo = manager.getRepository(
        StadiumConstructionEntity,
      );
      const created = constructionRepo.create({
        teamId,
        kind: StadiumConstructionKind.UPGRADE,
        deltaSeats: 0,
        startingCapacity: stadium.capacity,
        endingCapacity: stadium.capacity,
        targetLevel,
        totalWeeks: weeks,
        remainingWeeks: weeks,
        cost,
        refund: 0,
        status: StadiumConstructionStatus.IN_PROGRESS,
        seasonStarted: season,
        weekStarted: week,
      });
      const saved = await constructionRepo.save(created);

      const financeRepo = manager.getRepository(FinanceEntity);
      const transactionRepo = manager.getRepository(TransactionEntity);
      const finance = await financeRepo.findOne({
        where: { teamId: teamUuid },
      });
      if (!finance) {
        throw new NotFoundException(`Finance record not found for team ${teamId}`);
      }
      finance.balance -= cost;
      await financeRepo.save(finance);
      await transactionRepo.save(
        transactionRepo.create({
          teamId,
          amount: -cost,
          type: TransactionType.OTHER_EXPENSE,
          season,
          week,
          description: `Stadium upgrade to level ${targetLevel} queued`,
          relatedId: saved.id,
        }),
      );

      return saved;
    });

    this.logger.info(
      `Stadium upgrade queued for team ${teamId}: level ${currentLevel} -> ${targetLevel} over ${weeks} weeks`,
    );

    return { construction, weeks, cost };
  }

  /**
   * Return active projects first, then the most recent completed rows so the
   * Stadium page can render a "Recently completed" strip.
   */
  async listForTeam(teamId: string): Promise<StadiumConstructionEntity[]> {
    const teamUuid = teamId as Uuid;
    const inProgress = await this.constructionRepo.find({
      where: {
        teamId: teamUuid,
        status: StadiumConstructionStatus.IN_PROGRESS,
      },
      order: { createdAt: 'DESC' },
    });
    const completed = await this.constructionRepo.find({
      where: { teamId: teamUuid, status: StadiumConstructionStatus.COMPLETED },
      order: { completedAt: 'DESC' },
      take: 10,
    });
    return [...inProgress, ...completed];
  }

  /**
   * Resolve current season/week via MAX over match table. Same query as
   * `StadiumService.getCurrentSeasonAndWeek` — duplicated to avoid a
   * cross-service refactor (the codebase already has 3 copies).
   */
  private async getCurrentSeasonAndWeek(): Promise<{
    season: number;
    week: number;
  }> {
    const result = await this.matchRepo
      .createQueryBuilder('match')
      .select('MAX(match.season)', 'maxSeason')
      .addSelect('MAX(match.week)', 'maxWeek')
      .getRawOne();
    return {
      season: result?.maxSeason || 1,
      week: result?.maxWeek || 1,
    };
  }

  private validateDelta(delta: number): void {
    if (!Number.isFinite(delta) || !Number.isInteger(delta)) {
      throw new BadRequestException('Delta must be an integer');
    }
    if (delta < STADIUM_CONSTRUCTION_MIN_SEATS) {
      throw new BadRequestException(
        `Delta must be at least ${STADIUM_CONSTRUCTION_MIN_SEATS.toLocaleString()} seats`,
      );
    }
    if (delta > STADIUM_CONSTRUCTION_MAX_SEATS_PER_JOB) {
      throw new BadRequestException(
        `Delta must be at most ${STADIUM_CONSTRUCTION_MAX_SEATS_PER_JOB.toLocaleString()} seats per project`,
      );
    }
  }
}
