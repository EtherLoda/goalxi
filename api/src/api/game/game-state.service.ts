import {
  currentSeasonWeek,
  GAME_SETTINGS,
  resolveInitDate,
} from '@goalxi/database';
import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

/**
 * Resolves the "what season / week is it right now?" question for
 * the public API.
 *
 * All five sites that need a season/week (this service,
 * training tick, finance-scheduler, staffs.service) route
 * through the same pure function (`currentSeasonWeek`)
 * anchored to the same `gameStart`.
 *
 * `gameStart` is sourced from `system_config.init_date` when
 * it exists (the post-init steady state — the `pnpm init:run`
 * script writes that row at boot), with the
 * `GAME_START_DATE` env var as the override / fallback
 * for fresh DBs. The historical code resolved from the env
 * var only, which silently shadowed the DB row after the
 * first init — a restart of the API with no env var
 * landed on "today UTC midnight" even though the row said
 * otherwise. `resolveInitDate(manager, envValue)` is the
 * canonical helper that puts the DB row first.
 *
 * The resolution is async (one SQL SELECT on the singleton
 * `system_config` PK row), so it happens in `onModuleInit`
 * rather than the constructor. The first HTTP request
 * lands after `onModuleInit` has run, so `gameStart` is
 * always populated by the time the controller calls
 * `getCurrentSeasonWeek`.
 */
@Injectable()
export class GameStateService implements OnModuleInit {
  private gameStart!: Date;

  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async onModuleInit(): Promise<void> {
    this.gameStart = await resolveInitDate(
      this.dataSource.manager,
      process.env.GAME_START_DATE,
    );
  }

  getCurrentSeasonWeek(): {
    season: number;
    week: number;
    seasonLengthWeeks: number;
    regularSeasonWeeks: number;
  } {
    // `onModuleInit` populates `gameStart` before any
    // HTTP request is served (Nest awaits all
    // `onModuleInit` hooks before binding the HTTP
    // listener). If this throws, the lifecycle is
    // genuinely broken — surface it loudly rather
    // than serving silently-wrong week numbers.
    if (!this.gameStart) {
      throw new Error(
        'GameStateService.gameStart is unset — onModuleInit did not run. ' +
          'This is a Nest lifecycle bug, not a runtime condition.',
      );
    }

    const { season, week } = currentSeasonWeek(new Date(), this.gameStart);

    // The season SHAPE travels with the season NUMBER. Two callers render
    // "MW{week}/{total}" and both previously hardcoded 16 in the frontend,
    // which is how the header ended up reading "MW16/16" forever once the
    // season was compressed to 11 weeks. One field here is cheaper than a
    // second request or a duplicated constant in two components.
    //
    // `regularSeasonWeeks` is the number a "week N of M" progress
    // indicator should count to — the regular season occupies weeks
    // 1..M and week M+1 is the playoff week, which is not part of the
    // league fixture list a user is looking at.
    return {
      season,
      week,
      seasonLengthWeeks: GAME_SETTINGS.SEASON_LENGTH_WEEKS,
      regularSeasonWeeks: GAME_SETTINGS.REGULAR_SEASON_WEEKS,
    };
  }
}
