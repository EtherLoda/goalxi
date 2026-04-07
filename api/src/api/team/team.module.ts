import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PlayerModule } from '../player/player.module';
import { StaffEntity } from '@goalxi/database';
import { TeamController } from './team.controller';
import { TeamService } from './team.service';

@Module({
  imports: [PlayerModule, TypeOrmModule.forFeature([StaffEntity])],
  controllers: [TeamController],
  providers: [TeamService],
  exports: [TeamService],
})
export class TeamModule {}
