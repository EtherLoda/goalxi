import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  UserEntity,
  LeagueEntity,
  TeamEntity,
  PlayerEntity,
  StaffEntity,
  StadiumEntity,
  FanEntity,
  FinanceEntity,
  MatchEntity,
  WeatherEntity,
  LeagueStandingEntity,
  SystemConfigEntity,
  ScoutCandidateEntity,
  TacticsPresetEntity,
} from '@goalxi/database';
import { BootstrapService } from './bootstrap.service';
import { UserGenerator } from './generators/user.generator';
import { LeagueGenerator } from './generators/league.generator';
import { TeamGenerator } from './generators/team.generator';
import { ScheduleGenerator } from './generators/schedule.generator';
import { WeatherGenerator } from './generators/weather.generator';

/**
 * Wires the auto-recover `BootstrapService` + the
 * individual generators it orchestrates. The youth-league
 * / youth-team generators that the historical bootstrap
 * ran are intentionally omitted — the youth pipeline was
 * retired and the new init (`InitService`) only generates
 * senior rows.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      UserEntity,
      LeagueEntity,
      TeamEntity,
      PlayerEntity,
      StaffEntity,
      StadiumEntity,
      FanEntity,
      FinanceEntity,
      MatchEntity,
      WeatherEntity,
      LeagueStandingEntity,
      SystemConfigEntity,
      ScoutCandidateEntity,
      TacticsPresetEntity,
    ]),
  ],
  providers: [
    BootstrapService,
    UserGenerator,
    LeagueGenerator,
    TeamGenerator,
    ScheduleGenerator,
    WeatherGenerator,
  ],
  exports: [BootstrapService, UserGenerator, LeagueGenerator, TeamGenerator, ScheduleGenerator, WeatherGenerator],
})
export class BootstrapModule {}
