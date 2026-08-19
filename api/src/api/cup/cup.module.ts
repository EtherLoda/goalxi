import {
  CupBracketSlotEntity,
  CupEntity,
  CupRoundEntity,
  TeamEntity,
} from '@goalxi/database';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CupController } from './cup.controller';
import { CupService } from './cup.service';

/**
 * Read-only API for the cup competition. Phase 4 only
 * exposes GET endpoints — cup creation, scheduling and
 * progress live in the settlement service (CupGenerator /
 * CupSchedulerService / CupProgressProcessor).
 *
 * Team lookup is shared with the league/team modules via
 * the `team` table; the bracket endpoint needs it to render
 * team names alongside the slot rows.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      CupEntity,
      CupRoundEntity,
      CupBracketSlotEntity,
      TeamEntity,
    ]),
  ],
  controllers: [CupController],
  providers: [CupService],
  exports: [CupService],
})
export class CupModule {}
