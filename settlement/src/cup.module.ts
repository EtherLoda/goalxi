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
 *   - `CupProgressProcessor` consumes the dedicated `cup-progress`
 *     queue. It runs the round-closeout + next-round slot
 *     creation for `match.type === 'CUP'` matches.
 *
 *     It deliberately does **not** share the `match-completion`
 *     queue with the API's league completion worker. BullMQ workers
 *     compete for jobs rather than broadcasting them, so sharing a
 *     queue meant each job went to exactly one of the two workers:
 *     cup jobs reached the API worker and left the bracket
 *     un-advanced, while league jobs reached this processor and
 *     were dropped without standings/ELO/revenue. `MatchSchedulerService.completeMatches`
 *     now fans cup matches out to both queues.
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
      name: 'cup-progress',
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
