import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  CoachPlayerAssignmentEntity,
  PlayerEntity,
  StaffEntity,
} from '@goalxi/database';
import { YouthProgressionProcessor } from './processors/youth-progression.processor';

/**
 * ⛔ **FROZEN SUBSYSTEM — hands off.**
 *
 * Youth development is paused indefinitely; see the "Youth Pipeline"
 * section of `CLAUDE.md`. This module must keep registering its
 * processor — the weekly growth + reveal tick is still running and youth
 * fixtures are still simulated every matchday. Freezing means *don't
 * develop it*, not *shut it down*.
 *
 * `StaffEntity` and `CoachPlayerAssignmentEntity` are registered but no
 * longer used by the processor: leftovers from the YOUTH_COACH-removal
 * batch (the enum value was dropped by migration `1724000000000`). Left
 * in place deliberately — see the "Known limitations" list in
 * `CLAUDE.md` for the general rule about not doing drive-by cleanup in
 * this area.
 */
@Module({
  imports: [
    BullModule.registerQueue({
      name: 'youth-progression-settlement',
    }),
    TypeOrmModule.forFeature([
      PlayerEntity,
      StaffEntity,
      CoachPlayerAssignmentEntity,
    ]),
  ],
  providers: [YouthProgressionProcessor],
  exports: [BullModule],
})
export class YouthProgressionModule {}
