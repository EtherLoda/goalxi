import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Inject } from '@nestjs/common';
import { LOGGER_SERVICE, PinoLoggerService } from '@goalxi/logger';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Job } from 'bullmq';
import { FanEntity, TeamEntity, FAN_HIDDEN_CAP } from '@goalxi/database';

/**
 * Bilinear fan growth model.
 *
 * Two axes:
 *   - `ratio` = currentFans / cap, clamped to [0, 1]
 *   - `e`     = fanEmotion / 100, clamped to [0, 1]
 *
 * Four corner values (units: weekly fan change):
 *   - low-ratio  × high-emotion  = +1750  (small club, happy fans)
 *   - low-ratio  × low-emotion   = +650   (small club, angry fans)
 *   - high-ratio × high-emotion  = +200   (top club, happy fans)
 *   - high-ratio × low-emotion   = −750   (top club, angry fans)
 *
 * The function is the standard bilinear blend of the two axis edges:
 *   netChange = lowBase(ratio=0) * (1 - ratio) + highBase(ratio=1) * ratio
 *   where lowBase / highBase themselves are linear in `e`.
 *
 * Properties this preserves:
 *   - Small clubs always grow (even with angry fans — small clubs have
 *     "growth protection" because both the market cap and the absolute
 *     loss base are small).
 *   - Top clubs are extremely sensitive to emotion: a single emotion
 *     swing can move them from +200 to −750. A 95%-full club with
 *     0 emotion loses ≈ 700/week — about 0.7%/week, i.e. 36%/year.
 *   - There is no recent-form input; the fan emotion field is itself
 *     a roll-up of recent results, so adding `recentForm` back as a
 *     second channel would double-count.
 */
const LOW_HIGH = 1750;
const LOW_LOW = 650;
const HIGH_HIGH = 200;
const HIGH_LOW = -750;

@Injectable()
@Processor('fan-settlement')
export class FanProcessor extends WorkerHost {
  constructor(
    @Inject(LOGGER_SERVICE)
    private readonly logger: PinoLoggerService,
    @InjectRepository(FanEntity)
    private fanRepo: Repository<FanEntity>,
    @InjectRepository(TeamEntity)
    private teamRepo: Repository<TeamEntity>,
  ) {
    super();
  }

  /**
   * Pure function — exported as a static so the spec can call it
   * directly without spinning up a Nest container.
   */
  static calculateWeeklyFanChange(
    currentFans: number,
    cap: number,
    fanEmotion: number,
  ): number {
    const ratio = Math.min(Math.max(currentFans / cap, 0), 1);
    const e = Math.min(Math.max(fanEmotion / 100, 0), 1);

    const lowBase = LOW_LOW + (LOW_HIGH - LOW_LOW) * e;
    const highBase = HIGH_LOW + (HIGH_HIGH - HIGH_LOW) * e;

    return lowBase * (1 - ratio) + highBase * ratio;
  }

  async process(job: Job<any, any, string>): Promise<any> {
    this.logger.info('[FanProcessor] Starting weekly fan settlement...');

    const startTime = Date.now();

    try {
      // Get all teams with league info
      const teams = await this.teamRepo.find({
        relations: ['league'],
      });

      let totalFansUpdated = 0;

      for (const team of teams) {
        const fan = await this.fanRepo.findOne({ where: { teamId: team.id } });
        if (!fan) continue;

        const tier = team.league?.tier || 4;
        const cap =
          FAN_HIDDEN_CAP[tier as keyof typeof FAN_HIDDEN_CAP] || 100_000;

        // Calculate weekly change via the static bilinear helper so
        // the same logic is reachable from the unit spec without
        // instantiating the full processor.
        const change = FanProcessor.calculateWeeklyFanChange(
          fan.totalFans,
          cap,
          fan.fanEmotion,
        );
        fan.totalFans = Math.max(1000, fan.totalFans + change);

        await this.fanRepo.save(fan);
        totalFansUpdated++;
      }

      const duration = Date.now() - startTime;
      this.logger.info(
        `[FanProcessor] Fan settlement completed! ` +
          `${totalFansUpdated} teams updated ` +
          `in ${duration}ms`,
      );

      return {
        teamsProcessed: teams.length,
        fansUpdated: totalFansUpdated,
        duration,
      };
    } catch (error) {
      this.logger.error(
        '[FanProcessor] Error processing fan settlement',
        error,
      );
      throw error;
    }
  }
}
