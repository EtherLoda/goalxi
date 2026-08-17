import { Injectable, Inject, Logger } from '@nestjs/common';
import { LOGGER_SERVICE, PinoLoggerService } from '@goalxi/logger';
import { DataSource } from 'typeorm';
import {
  LeagueEntity,
  SYSTEM_CONFIG_INIT_DATE_KEY,
  SystemConfigEntity,
  TeamEntity,
  startOfUtcDay,
} from '@goalxi/database';
import { UserGenerator } from '../bootstrap/generators/user.generator';
import { LeagueGenerator } from '../bootstrap/generators/league.generator';
import { TeamGenerator } from '../bootstrap/generators/team.generator';
import { ScheduleGenerator } from '../bootstrap/generators/schedule.generator';
import { WeatherGenerator } from '../bootstrap/generators/weather.generator';
import { InitOptions } from './init.types';

/**
 * One-shot orchestrator for the production / dev game init.
 * Called from:
 *   - `scripts/init.ts` CLI (`pnpm init:run`).
 *   - `BootstrapService` when the system_config row is
 *     missing (auto-recover path, with sane defaults).
 *
 * The full init pipeline (in order):
 *
 *   1. wipe          — drop every row from every game table
 *                      (only when `--force` or `--wipe-only`)
 *   2. init_date     — write `system_config.init_date` so
 *                      later boots and the match scheduler
 *                      anchor on a stable value
 *   3. users         — system + bot users
 *   4. leagues       — China I/II/III/IV pyramid (or small
 *                      pyramid under `--small`)
 *   5. teams         — 16 BOT teams per league, with squad
 *                      + staff + finance + fan + stadium
 *                      (via the shared `createTeam` helper)
 *   6. presets       — one default `tactics_preset` per
 *                      team so the match scheduler has a
 *                      fallback formation on day 1
 *   7. scout seeds   — one senior-mode scout candidate
 *                      per team so a freshly-claimed team
 *                      has something to look at
 *   8. schedule      — 30-round senior double round-robin
 *                      anchored on the next-Monday 00:00
 *                      UTC after `initDate`
 *   9. weather       — 7 days of forecast from `initDate`
 *  10. announcement  — season-1 banner pinned to the top
 *                      of the announcement feed
 *
 * Each step is idempotent on its own — re-running init
 * without `--force` is a no-op for every step that's
 * already done. The init date step is the only one that
 * always runs (it overwrites the previous value with the
 * CLI-supplied date so an "init-date-only" update is
 * possible via the CLI).
 */
@Injectable()
export class InitService {
  private readonly nestLogger = new Logger(InitService.name);

  constructor(
    @Inject(LOGGER_SERVICE)
    private readonly logger: PinoLoggerService,
    private readonly dataSource: DataSource,
    private readonly userGenerator: UserGenerator,
    private readonly leagueGenerator: LeagueGenerator,
    private readonly teamGenerator: TeamGenerator,
    private readonly scheduleGenerator: ScheduleGenerator,
    private readonly weatherGenerator: WeatherGenerator,
  ) {}

  /**
   * The one entry point. Returns a small summary object so
   * the CLI can print a `Done in Nms, X leagues / Y teams /
   * Z matches` banner.
   */
  async run(options: InitOptions): Promise<InitResult> {
    const start = Date.now();
    this.logger.info(
      `[Init] start (initDate=${options.initDate.toISOString().split('T')[0]}, ` +
        `force=${options.force}, wipeOnly=${options.wipeOnly}, small=${options.small})`,
    );

    // 1. wipe
    if (options.force || options.wipeOnly) {
      const wiped = await this.wipeAllData();
      this.logger.warn(`[Init] wiped ${wiped.tables} table(s)`);
      if (options.wipeOnly) {
        return {
          wiped: true,
          elapsedMs: Date.now() - start,
        };
      }
    }

    // 2. init_date
    await this.writeInitDate(options.initDate);

    // 3. users
    const { systemUserId, botUserId } =
      await this.userGenerator.ensureSystemUsers();
    this.logger.info(
      `[Init] users ensured (system=${systemUserId.slice(0, 8)}, bot=${botUserId.slice(0, 8)})`,
    );

    // 4. leagues
    await this.leagueGenerator.generatePyramid({ small: options.small });
    this.logger.info('[Init] leagues ensured');

    // 5. teams
    await this.teamGenerator.generateAllTeams(botUserId, {
      small: options.small,
    });
    this.logger.info('[Init] teams ensured');

    // 6. presets — implemented in the content commit
    //    (`TacticsPresetGenerator`). For Commit 1 the call
    //    is a no-op stub so the pipeline can be wired
    //    end-to-end before the per-team writes land.
    //    see: `init.presets.step` for the call site.
    await this.ensurePresets();

    // 7. scout seeds — see comment in step 6; implemented
    //    in the content commit.
    await this.ensureScoutSeeds();

    // 8. schedule
    await this.scheduleGenerator.generateSeason1Schedule(options.initDate);
    this.logger.info('[Init] schedule ensured');

    // 9. weather
    await this.weatherGenerator.generateInitialWeather(options.initDate);
    this.logger.info('[Init] weather ensured');

    // 10. announcements — see comment in step 6;
    //     implemented in the content commit.
    await this.ensureAnnouncements(options.initDate);

    // summary
    const summary = await this.summarize();
    const elapsedMs = Date.now() - start;
    this.logger.info(
      `[Init] done in ${elapsedMs}ms — ` +
        `${summary.leagues} leagues, ${summary.teams} teams, ` +
        `${summary.matches} matches`,
    );

    return {
      wiped: false,
      elapsedMs,
      ...summary,
    };
  }

  // ---------- step implementations ----------

  private async writeInitDate(initDate: Date): Promise<void> {
    const day = startOfUtcDay(initDate);
    const iso = day.toISOString().split('T')[0];
    const repo = this.dataSource.getRepository(SystemConfigEntity);
    // Upsert via the unique PK on `key`. We do this with a
    // raw query so the no-op (value unchanged) path doesn't
    // bump `updated_at` and pretend the init was redone.
    await this.dataSource.query(
      `INSERT INTO "system_config" ("key", "value", "created_at", "updated_at")
       VALUES ($1, $2, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
       ON CONFLICT ("key") DO UPDATE
         SET "value" = EXCLUDED."value",
             "updated_at" = CURRENT_TIMESTAMP
         WHERE "system_config"."value" IS DISTINCT FROM EXCLUDED."value"`,
      [SYSTEM_CONFIG_INIT_DATE_KEY, iso],
    );
    this.logger.info(`[Init] system_config.init_date = ${iso}`);
  }

  private async ensurePresets(): Promise<void> {
    // Implemented in the content commit. Kept as a private
    // method so the call site in `run()` is stable across
    // commits — the CLI summary works the moment the real
    // implementation lands.
  }

  private async ensureScoutSeeds(): Promise<void> {
    // Implemented in the content commit.
  }

  private async ensureAnnouncements(_initDate: Date): Promise<void> {
    // Implemented in the content commit.
  }

  private async wipeAllData(): Promise<{ tables: number }> {
    // TRUNCATE … RESTART IDENTITY CASCADE in one shot.
    // Schema is preserved (we don't DROP) and the
    // RESTART IDENTITY resets any serial PKs so a fresh
    // init has monotonic ids again.
    //
    // We explicitly list every game table so we don't
    // accidentally truncate something we shouldn't
    // (e.g. `migrations`).
    const tables = [
      'match_event',
      'match_tactics',
      'match_team_stats',
      'match',
      'tactics_preset',
      'staff',
      'season_result',
      'transaction',
      'transfer_transaction',
      'player_event',
      'player_competition_stats',
      'player_transaction',
      'injury',
      'auction',
      'archived_player_event',
      'archived_transaction',
      'archived_player_competition_stats',
      'archived_season_result',
      'league_standing',
      'scout_candidate',
      'stadium_construction',
      'finance',
      'fan',
      'stadium',
      'player',
      'team',
      'league',
      'announcement',
      'weather',
      'system_config',
      'session',
      'forum_reaction',
      'forum_post',
      'forum_thread',
      'forum_category',
      'youth_team',
      'youth_league',
      'training_update',
      'coach_player_assignment',
      '"user"',
    ];
    if (tables.length === 0) {
      return { tables: 0 };
    }
    const sql = `TRUNCATE TABLE ${tables.join(', ')} RESTART IDENTITY CASCADE`;
    this.logger.warn(`[Init] executing: ${sql.replace(/\s+/g, ' ')}`);
    await this.dataSource.query(sql);
    return { tables: tables.length };
  }

  private async summarize(): Promise<{
    leagues: number;
    teams: number;
    matches: number;
  }> {
    const [leagues, teams, matches] = await Promise.all([
      this.dataSource.getRepository(LeagueEntity).count(),
      this.dataSource.getRepository(TeamEntity).count(),
      this.dataSource
        .getRepository('match')
        .createQueryBuilder('m')
        .where('m.season = :s', { s: 1 })
        .getCount(),
    ]);
    return { leagues, teams, matches };
  }

  // Exposed for tests / debug only.
  protected getUsers(): Promise<{ systemUserId: string; botUserId: string }> {
    return this.userGenerator.ensureSystemUsers();
  }
}

export interface InitResult {
  wiped: boolean;
  elapsedMs: number;
  leagues?: number;
  teams?: number;
  matches?: number;
}
