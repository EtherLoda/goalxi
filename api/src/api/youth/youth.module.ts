import { PlayerEntity, TeamEntity, YouthPlayerEntity } from '@goalxi/database';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { PlayerEventModule } from '../player-event/player-event.module';
import { YouthController } from './youth.controller';
import { YouthService } from './youth.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([YouthPlayerEntity, PlayerEntity, TeamEntity]),
    AuthModule,
    PlayerEventModule,
  ],
  controllers: [YouthController],
  providers: [YouthService],
  exports: [YouthService],
})
export class YouthModule {}
