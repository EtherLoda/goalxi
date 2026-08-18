import { Injectable, OnModuleInit, Inject } from '@nestjs/common';
import { LOGGER_SERVICE, PinoLoggerService } from '@goalxi/logger';
import { DataSource } from 'typeorm';
import { LeagueGenerator } from './generators/league.generator';
import { ScheduleGenerator } from './generators/schedule.generator';
import { WeatherGenerator } from './generators/weather.generator';
import { TacticsPresetGenerator } from './generators/tactics-preset.generator';
import { ScoutSeedGenerator } from './generators/scout-seed.generator';
import { AnnouncementGenerator } from './generators/announcement.generator';
import { CupGenerator } from './generators/cup.generator';
import {
  SYSTEM_CONFIG_INIT_DATE_KEY,
  SystemConfigEntity,
  resolveInitDate,
} from '@goalxi/database';

/**
 * Settlement-side auto-recover. Runs on every `onModuleInit`
 * and does one of two things:
 *
 *   1. **Already initialized** (`system_config.init_date`
 *      exists): gap-fill only. Each individual generator
 *      is itself idempotent (it skips if its data is
 *      present), so a freshly-deployed settlement that
 *      boots against an existing init will quietly fill
 *      in any rows that the init script missed (e.g. a
 *      new tactics_preset column added after init).
 *
 *   2. **Not initialized** (no `init_date` row): log a
 *      loud warning pointing the operator at
 *      `pnpm init:run --init-date=YYYY-MM-DD`. We do
 *      NOT auto-create — the user explicitly required
 *      the init date as a CLI argument, so falling
 *      back to "today" silently would be a footgun.
 *      The init script is also the only path that
 *      knows the season anchor; auto-creating here
 *      would put the season start in the past and
 *      break the preprocessor's `LessThanOrEqual`
 *      filter for the first matchday.
 *
 * The full init flow (including the wipe path) lives in
 * `InitService` — see `scripts/init.ts` for the CLI.
 */
@Injectable()
export class BootstrapService implements OnModuleInit {
  constructor(
    @Inject(LOGGER_SERVICE)
    private readonly logger: PinoLoggerService,
    private readonly dataSource: DataSource,
    private readonly leagueGenerator: LeagueGenerator,
    private readonly scheduleGenerator: ScheduleGenerator,
    private readonly weatherGenerator: WeatherGenerator,
    private readonly tacticsPresetGenerator: TacticsPresetGenerator,
    private readonly scoutSeedGenerator: ScoutSeedGenerator,
    private readonly announcementGenerator: AnnouncementGenerator,
    private readonly cupGenerator: CupGenerator,
  ) {}

  async onModuleInit() {
    const initDateRow = await this.dataSource
      .getRepository(SystemConfigEntity)
      .findOne({ where: { key: SYSTEM_CONFIG_INIT_DATE_KEY } });

    if (!initDateRow) {
      this.logger.warn(
        '[Bootstrap] No system_config.init_date found — the DB has ' +
          'never been initialized. Run `pnpm --filter settlement ' +
          'init:run --init-date=YYYY-MM-DD` to set up. ' +
          'Auto-bootstrap is disabled by design; the init script is ' +
          'the only place that knows the season anchor.',
      );
      return;
    }

    this.logger.info(
      `[Bootstrap] init_date=${initDateRow.value} — running gap-fill`,
    );

    // Re-resolve the init date from the DB so the schedule
    // generator's first-match anchor matches what init wrote.
    const initDate = await resolveInitDate(
      this.dataSource.manager,
      process.env.GAME_START_DATE,
    );

    // Gap-fill: each generator is idempotent and skips
    // when its data is already present. Re-running is safe.
    const start = Date.now();
    await this.leagueGenerator.generatePyramid();
    // Skip teamGenerator on auto-bootstrap — team
    // creation is an init-only concern. A new team
    // gets created by the onboarding claim flow, not
    // here.
    await this.scheduleGenerator.generateSeason1Schedule(initDate);
    await this.weatherGenerator.generateInitialWeather(initDate);
    await this.tacticsPresetGenerator.generate();
    await this.scoutSeedGenerator.generate();
    await this.announcementGenerator.generate(initDate);
    // Cup is generated for the CURRENT season — same number
    // the schedule generator uses. For season 2+ the
    // season-transition cron will call this with the new
    // season number (TBD; MVP is season 1 only).
    await this.cupGenerator.generateCupForSeason(1);
    this.logger.info(
      `[Bootstrap] gap-fill complete in ${Date.now() - start}ms (no-op if all data already present)`,
    );
  }
}
