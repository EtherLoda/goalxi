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
} from '@goalxi/database';
import { BootstrapService } from './bootstrap.service';
import { UserGenerator } from './generators/user.generator';
import { LeagueGenerator } from './generators/league.generator';
import { TeamGenerator } from './generators/team.generator';
import { ScheduleGenerator } from './generators/schedule.generator';
import { WeatherGenerator } from './generators/weather.generator';

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
  exports: [BootstrapService],
})
export class BootstrapModule {}
