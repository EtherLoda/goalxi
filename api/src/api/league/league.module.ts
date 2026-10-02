import {
  ArchivedSeasonResultEntity,
  LeagueEntity,
  LeagueStandingEntity,
  SeasonResultEntity,
  TeamEntity,
} from '@goalxi/database';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LeagueController } from './league.controller';
import { LeagueService } from './league.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      LeagueEntity,
      LeagueStandingEntity,
      SeasonResultEntity,
      ArchivedSeasonResultEntity,
      TeamEntity,
    ]),
  ],
  controllers: [LeagueController],
  // `LeagueStructureService` was removed here: zero callers repo-wide,
  // and it was a second writer of `league_standing.position` with a
  // fourth copy of the standings sort key.
  providers: [LeagueService],
  exports: [LeagueService],
})
export class LeagueModule {}
