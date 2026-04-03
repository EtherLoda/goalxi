import {
  LeagueEntity,
  LeagueStandingEntity,
  TeamEntity,
} from '@goalxi/database';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LeagueStructureService } from './league-structure.service';
import { LeagueController } from './league.controller';
import { LeagueService } from './league.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([LeagueEntity, LeagueStandingEntity, TeamEntity]),
  ],
  controllers: [LeagueController],
  providers: [LeagueService, LeagueStructureService],
  exports: [LeagueService, LeagueStructureService],
})
export class LeagueModule {}
