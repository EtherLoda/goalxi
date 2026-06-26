import { Uuid } from '@/common/types/common.type';
import {
  FinanceEntity,
  MatchEntity,
  STADIUM_CONSTRUCTION_MAX_SEATS_PER_JOB,
  STADIUM_CONSTRUCTION_MIN_SEATS,
  STADIUM_COST_PER_SEAT,
  STADIUM_MAX_CAPACITY,
  STADIUM_MIN_CAPACITY,
  StadiumConstructionEntity,
  StadiumConstructionKind,
  StadiumConstructionStatus,
  StadiumEntity,
  TransactionEntity,
  TransactionType,
  computeConstructionWeeks,
  computeDemolishWeeks,
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
  ): Promise<{
    construction: StadiumConstructionEntity;
    weeks: number;
    cost: number;
  }> {
    const teamUuid = teamId as Uuid;
    this.validateDelta(delta);

    const stadium = await this.stadiumRepo.findOne({
      where: { teamId: teamUuid },
    });
    if (!stadium) {
      throw new NotFoundException(`Stadium not found for team ${teamId}`);
    }

    if (kind === StadiumConstructionKind.EXPAND) {
      if (stadium.capacity + delta > STADIUM_MAX_CAPACITY) {
        throw new BadRequestException(
          `Cannot expand past ${STADIUM_MAX_CAPACITY.toLocaleString()} seats`,
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
