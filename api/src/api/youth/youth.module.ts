import { PlayerEntity, TeamEntity, YouthPlayerEntity } from '@goalxi/database';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { GameModule } from '../game/game.module';
import { PlayerEventModule } from '../player-event/player-event.module';
import { YouthController } from './youth.controller';
import { YouthService } from './youth.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([YouthPlayerEntity, PlayerEntity, TeamEntity]),
    AuthModule,
    PlayerEventModule,
    // [S3] Needed so YouthService can read the real current season
    // (previously the season was hard-coded to 1 in promote()).
    GameModule,
  ],
  controllers: [YouthController],
  providers: [YouthService],
  exports: [YouthService],
})
export class YouthModule {}
