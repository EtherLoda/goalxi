import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import {Injectable, Logger, Inject } from '@nestjs/common';
import { LOGGER_SERVICE, PinoLoggerService } from '@goalxi/logger';
import { InjectRepository } from '@nestjs/typeorm';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, MoreThan, Repository } from 'typeorm';
import { Job } from 'bullmq';
import {
  FinanceEntity,
  MatchEntity,
  SEAT_DEMOLISH_REFUND_RATE,
  STADIUM_COST_PER_SEAT,
  STADIUM_MIN_CAPACITY,
  StadiumConstructionEntity,
  StadiumConstructionKind,
  StadiumConstructionStatus,
  StadiumEntity,
  TeamEntity,
  TransactionEntity,
  TransactionType,
} from '@goalxi/database';
import { NotificationService } from '../notification/notification.service';
import { NotificationType } from '../notification/notification.service';

/**
 * §5 Stadium �?Weekly tick for queued construction / demolition projects.
 *
 * Triggered by `WeeklySettlementService` every Thursday at 00:00 alongside
 * training / condition settlement. Decrements `remaining_weeks` on every
 * in-flight row, and on the tick where it hits 0:
 *   - updates `StadiumEntity.capacity`
 *   - records a refund transaction for DEMOLISH (paid from finance ledger)
 *   - emits a `STADIUM_CONSTRUCTION_COMPLETED` notification to the team
 *     manager (skipped for bot teams with no userId)
 *
 * Race-free against user input because the api service refuses new projects
 * while one is IN_PROGRESS for the team.
 */
@Injectable()
@Processor('construction-settlement')
export class StadiumConstructionProcessor extends WorkerHost {

  constructor(
    @Inject(LOGGER_SERVICE)
    private readonly logger: PinoLoggerService,
    @InjectRepository(StadiumConstructionEntity)
    private readonly constructionRepo: Repository<StadiumConstructionEntity>,
    @InjectRepository(StadiumEntity)
    private readonly stadiumRepo: Repository<StadiumEntity>,
    @InjectRepository(TeamEntity)
    private readonly teamRepo: Repository<TeamEntity>,
    @InjectRepository(MatchEntity)
    private readonly matchRepo: Repository<MatchEntity>,
    private readonly notificationService: NotificationService,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {
    super();
  }

  async process(job: Job<any, any, string>): Promise<any> {
    this.logger.info(
      `[StadiumConstructionProcessor] Starting tick (job ${job.id})`,
    );

    const start = Date.now();
    const inFlight = await this.constructionRepo.find({
      where: {
        status: StadiumConstructionStatus.IN_PROGRESS,
        remainingWeeks: MoreThan(0),
      },
    });

    let completed = 0;
    let ticked = 0;
    const { season, week } = await this.getCurrentSeasonAndWeek();

    for (const row of inFlight) {
      const newRemaining = row.remainingWeeks - 1;
      if (newRemaining > 0) {
        row.remainingWeeks = newRemaining;
        await this.constructionRepo.save(row);
        ticked++;
        continue;
      }

      await this.finalise(row, { season, week });
      completed++;
    }

    const duration = Date.now() - start;
    this.logger.info(
      `[StadiumConstructionProcessor] Done: ${completed} completed, ${ticked} ticked in ${duration}ms`,
    );

    return { ticked, completed, durationMs: duration };
  }

  @OnWorkerEvent('completed')
  onCompleted(job: Job) {
    this.logger.debug(`Job ${job.id} completed`);
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job, err: Error) {
    this.logger.error(`Job ${job.id} failed: ${err.message}`, err.stack);
  }

  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Apply the capacity change, refund (DEMOLISH), and notify the manager.
   * All three commit atomically inside a single DB transaction.
   */
  private async finalise(
    row: StadiumConstructionEntity,
    processingWeek: { season: number; week: number },
  ): Promise<void> {
    const refundAmount =
      row.kind === StadiumConstructionKind.DEMOLISH
        ? Math.floor(
            row.deltaSeats * STADIUM_COST_PER_SEAT * SEAT_DEMOLISH_REFUND_RATE,
          )
        : 0;

    await this.dataSource.transaction(async (manager) => {
      const stadiumRepo = manager.getRepository(StadiumEntity);
      const financeRepo = manager.getRepository(FinanceEntity);
      const transactionRepo = manager.getRepository(TransactionEntity);
      const constructionRepo = manager.getRepository(StadiumConstructionEntity);

      const stadium = await stadiumRepo.findOne({
        where: { teamId: row.teamId },
      });
      if (!stadium) {
        this.logger.error(
          `Stadium vanished mid-construction for team ${row.teamId} �?skipping`,
        );
        return;
      }

      const proposed =
        row.kind === StadiumConstructionKind.EXPAND
          ? stadium.capacity + row.deltaSeats
          : stadium.capacity - row.deltaSeats;
      stadium.capacity = Math.max(STADIUM_MIN_CAPACITY, proposed);
      await stadiumRepo.save(stadium);

      if (refundAmount > 0) {
        const finance = await financeRepo.findOne({
          where: { teamId: row.teamId },
        });
        if (finance) {
          finance.balance += refundAmount;
          await financeRepo.save(finance);
          await transactionRepo.save(
            transactionRepo.create({
              teamId: row.teamId,
              amount: refundAmount,
              type: TransactionType.OTHER_INCOME,
              season: processingWeek.season,
              week: processingWeek.week,
              description: `Stadium demolition completed (-${row.deltaSeats.toLocaleString()} �?${stadium.capacity.toLocaleString()})`,
              relatedId: row.id,
            }),
          );
        } else {
          this.logger.error(
            `Finance record missing for team ${row.teamId} �?refund of ${refundAmount} skipped`,
          );
        }
      }

      row.status = StadiumConstructionStatus.COMPLETED;
      row.remainingWeeks = 0;
      row.refund = refundAmount;
      row.seasonCompleted = processingWeek.season;
      row.weekCompleted = processingWeek.week;
      row.completedAt = new Date();
      await constructionRepo.save(row);
    });

    const team = await this.teamRepo.findOne({ where: { id: row.teamId } });
    if (team?.userId) {
      await this.notificationService.create(
        team.userId,
        NotificationType.STADIUM_CONSTRUCTION_COMPLETED,
        'notification.stadiumConstructionCompleted',
        {
          teamId: row.teamId,
          kind: row.kind,
          delta: row.deltaSeats,
          newCapacity: row.endingCapacity,
          weeks: row.totalWeeks,
        },
      );
    } else if (team?.isBot) {
      this.logger.debug(
        `Skipping notification for bot team ${row.teamId} (construction completed)`,
      );
    } else {
      this.logger.warn(
        `Team ${row.teamId} has no userId �?cannot notify of completed construction`,
      );
    }

    this.logger.info(
      `Stadium ${row.kind.toLowerCase()} completed for team ${row.teamId}: ${row.deltaSeats} seats �?${row.endingCapacity}`,
    );
  }

  /**
   * Resolve current season/week via MAX over match table �?same query the
   * api StadiumConstructionService uses.
   */
  private async getCurrentSeasonAndWeek(): Promise<{
    season: number;
    week: number;
  }> {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const result = await this.matchRepo
      .createQueryBuilder('match')
      .select('MAX(match.season)', 'maxSeason')
      .addSelect('MAX(match.week)', 'maxWeek')
      .getRawOne();
    return {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
      season: result?.maxSeason || 1,
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
      week: result?.maxWeek || 1,
    };
  }
}
