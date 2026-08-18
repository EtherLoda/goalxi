import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import {
  CupEntity,
  CupRoundEntity,
  CupEntryEntity,
  CupBracketSlotEntity,
  MatchEntity,
} from '@goalxi/database';
import { CupProgressProcessor } from './processors/cup-progress.processor';

/**
 * Wires the cup-competition side of settlement:
 *
 *   - `CupProgressProcessor` consumes the shared
 *     `match-completion` BullMQ queue. It filters for
 *     `match.type === 'CUP'` and runs the round-closeout +
 *     next-round slot creation. Non-cup matches are passed
 *     through to the league's own completion handler
 *     (which doesn't exist as a worker today — the league
 *     flow currently finalises matches via the scheduler's
 *     `completeMatches` cron tick, not via a worker).
 *
 *   - The `CupSchedulerService` is NOT in this module — it
 *     lives in `SchedulerModule` because that's where the
 *     cron-driven services cluster.
 *
 * Why the cup processor is a BullMQ worker (not a cron):
 * the round closeout must happen as soon as the LAST match
 * of a round completes. Polling for "are all matches in
 * this round done?" every N seconds adds latency and adds
 * a window where two ticks can race the round CAS. BullMQ
 * fires on match completion → closeout is event-driven, no
 * extra polling cost, and the CAS still prevents the
 * "two ticks see all-done at the same time" race.
 */
@Module({
  imports: [
    BullModule.registerQueue({
      name: 'match-completion',
    }),
    TypeOrmModule.forFeature([
      CupEntity,
      CupRoundEntity,
      CupEntryEntity,
      CupBracketSlotEntity,
      MatchEntity,
    ]),
  ],
  providers: [CupProgressProcessor],
})
export class CupModule {}
