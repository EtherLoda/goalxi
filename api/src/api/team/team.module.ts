import {
  StaffEntity,
  YouthTeamEntity,
  YouthLeagueEntity,
} from '@goalxi/database';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PlayerModule } from '../player/player.module';
import { ScoutsModule } from '../scouts/scouts.module';

import { TeamController } from './team.controller';
import { TeamService } from './team.service';

@Module({
  imports: [
    PlayerModule,
    ScoutsModule,
    TypeOrmModule.forFeature([
      StaffEntity,
      YouthTeamEntity,
      YouthLeagueEntity,
    ]),
  ],
  controllers: [TeamController],
  providers: [TeamService],
  exports: [TeamService],
})
export class TeamModule {}