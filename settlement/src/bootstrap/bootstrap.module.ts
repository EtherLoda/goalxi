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
  AnnouncementEntity,
  CupEntity,
  CupRoundEntity,
  CupEntryEntity,
  CupBracketSlotEntity,
} from '@goalxi/database';
import { BootstrapService } from './bootstrap.service';
import { UserGenerator } from './generators/user.generator';
import { LeagueGenerator } from './generators/league.generator';
import { TeamGenerator } from './generators/team.generator';
import { ScheduleGenerator } from './generators/schedule.generator';
import { WeatherGenerator } from './generators/weather.generator';
import { TacticsPresetGenerator } from './generators/tactics-preset.generator';
import { ScoutSeedGenerator } from './generators/scout-seed.generator';
import { AnnouncementGenerator } from './generators/announcement.generator';
import { CupGenerator } from './generators/cup.generator';

/**
 * Wires the auto-recover `BootstrapService` + the
 * individual generators it orchestrates. Both senior
 * (init `InitService` runs end-to-end) and the cup /
 * youth-structure gap-fill are wired here so a settlement
 * process that boots against an existing-but-incomplete
 * DB (e.g. one from before the cup + youth generators
 * were added) quietly back-fills the missing rows.
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
      AnnouncementEntity,
      CupEntity,
      CupRoundEntity,
      CupEntryEntity,
      CupBracketSlotEntity,
      YouthLeagueEntity,
      YouthTeamEntity,
    ]),
  ],
  providers: [
    BootstrapService,
    UserGenerator,
    LeagueGenerator,
    TeamGenerator,
    ScheduleGenerator,
    WeatherGenerator,
    TacticsPresetGenerator,
    ScoutSeedGenerator,
    AnnouncementGenerator,
    CupGenerator,
    YouthStructureGenerator,
  ],
  exports: [
    BootstrapService,
    UserGenerator,
    LeagueGenerator,
    TeamGenerator,
    ScheduleGenerator,
    WeatherGenerator,
    TacticsPresetGenerator,
    ScoutSeedGenerator,
    AnnouncementGenerator,
    CupGenerator,
    YouthStructureGenerator,
  ],
})
export class BootstrapModule {}
