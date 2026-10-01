import { Module } from '@nestjs/common';
import { EmailQueueModule } from './queues/email-queue/email-queue.module';
import { FinanceSettlementModule } from './queues/finance-settlement/finance-settlement.module';
import { MatchCompletionModule } from './queues/match-completion/match-completion.module';

// Background slice of the api process: the queues it produces to and
// consumes from. Everything here is api-owned (producer AND consumer in
// the same process).
//
// ## Why there is no `SettlementSchedulerModule` import
//
// This module used to import
// `settlement/dist/src/scheduler/scheduler.module` and boot its ~26
// `@Cron` handlers inside the api process. Combined with the
// `settlement` service ALSO booting its own `SchedulerModule`
// (`settlement/src/app.module.ts`), the default topology — root
// `pnpm dev`, and the shipped `api/docker-compose.yml` — ran every
// settlement cron TWICE, in two processes.
//
// That was not a theoretical race. The handlers that carry
// multi-step, non-idempotent writes had no distributed lock and no
// distributed latch:
//   - `season-transition.service.ts` `checkAndProcessSeasonStart`
//     (5 ordered steps; its own comment notes a mid-sequence failure
//     re-runs promotions and UN-SWAPs every pair on the next tick)
//   - `promotion-relegation.service.ts` `processAllTiers`
//     (5+ unwrapped writes; `swapTeamLeague` is not commutative)
//   - `league-standing.service.ts` `initNewSeasonStandings`
//   - `league-admin.service.ts` `addTeamToLeague`
//
// A few handlers were accidentally saved by CAS / latch logic
// (`match-scheduler`'s `UPDATE ... WHERE status='scheduled'`, the
// `playoff_swapped_at` latch, `league-award`'s event-existence
// check), which is exactly why this went unnoticed for so long: the
// safe paths masked the unsafe ones.
//
// ## Rule: the settlement process is the ONLY owner of settlement cron
//
// Do not re-add the import. If you need new scheduled work that reads
// or writes settlement-owned state, add a `@Cron` to
// `settlement/src/scheduler/` — it already has the game clock, the
// entity registrations, and the season/week anchor.
//
// What legitimately belongs in THIS module is only:
//   - `email`                    — produced by `auth`, consumed here
//   - `match-completion`         — produced by settlement's
//                                  `completeMatches` cron, consumed here
//   - `finance-settlement`       — produced by settlement's finance
//                                  cron, consumed here
//
// Note that `match-live.scheduler.ts` also carries `@Cron` handlers, but
// they are NOT settlement cron: they drive event *reveal* for the live
// match socket and live in `MatchLiveModule` (under `ApiModule`).
// Deliberately left alone.
@Module({
  imports: [EmailQueueModule, MatchCompletionModule, FinanceSettlementModule],
})
export class BackgroundModule {}
