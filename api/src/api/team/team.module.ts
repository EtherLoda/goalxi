import { Module } from '@nestjs/common';
import { PlayerModule } from '../player/player.module';
import { TeamController } from './team.controller';
import { TeamService } from './team.service';

@Module({
  imports: [PlayerModule],
  controllers: [TeamController],
  providers: [TeamService],
  exports: [TeamService],
})
export class TeamModule {}
