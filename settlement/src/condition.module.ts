import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  PlayerEntity,
  StaffEntity,
  TeamEntity,
  FanEntity,
} from '@goalxi/database';
import { ConditionProcessor } from './processors/condition.processor';

/**
 * Wires the weekly condition/form tick.
 *
 * ## This module used to not exist
 *
 * `ConditionProcessor` was decorated `@Processor('condition-settlement')`
 * and had a passing spec, but it was **not registered in any module's
 * `providers` array** — so it never became a live BullMQ worker. The
 * queue was registered (`scheduler.module.ts`) and a job was enqueued
 * every Thursday (`WeeklySettlementService`), so jobs piled up in Redis
 * `wait` forever. Consequences:
 *
 *   - `player.form` never converged. It is not cosmetic: the simulator
 *     reads it in five places (`simulator/src/engine/classes/Team.ts:114,227`,
 *     `match.engine.ts:1609,1613,4364,4485`), so every player's form was
 *     frozen at whatever the generator seeded.
 *   - `player.matchMinutes` was never reset. `MatchCompletionService`
 *     increments it per match (`match-completion.service.ts:418`) with no
 *     upper bound anywhere, so it grew without limit for every player.
 *
 * The spec missed the gap because `condition.processor.spec.ts` builds
 * its own `TestingModule` — the wiring is invisible to unit tests.
 */
@Module({
  imports: [
    BullModule.registerQueue({
      name: 'condition-settlement',
    }),
    TypeOrmModule.forFeature([
      PlayerEntity,
      StaffEntity,
      TeamEntity,
      FanEntity,
    ]),
  ],
  providers: [ConditionProcessor],
  exports: [BullModule],
})
export class ConditionModule {}
