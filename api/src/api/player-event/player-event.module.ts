import { PlayerEventEntity } from '@goalxi/database';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PlayerEventController } from './player-event.controller';
import { PlayerEventService } from './player-event.service';

@Module({
  imports: [TypeOrmModule.forFeature([PlayerEventEntity])],
  controllers: [PlayerEventController],
  providers: [PlayerEventService],
  exports: [PlayerEventService],
})
export class PlayerEventModule {}
