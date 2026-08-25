import { Injectable, Inject } from '@nestjs/common';
import { LOGGER_SERVICE, PinoLoggerService } from '@goalxi/logger';
import { DataSource } from 'typeorm';
import {
  LeagueEntity,
  SYSTEM_CONFIG_INIT_DATE_KEY,
  TeamEntity,
  startOfUtcDay,
} from '@goalxi/database';
import { LeagueGenerator } from '../bootstrap/generators/league.generator';
import { TeamGenerator } from '../bootstrap/generators/team.generator';
import { ScheduleGenerator } from '../bootstrap/generators/schedule.generator';
import { WeatherGenerator } from '../bootstrap/generators/weather.generator';
import { TacticsPresetGenerator } from '../bootstrap/generators/tactics-preset.generator';
import { ScoutSeedGenerator } from '../bootstrap/generators/scout-seed.generator';
import { AnnouncementGenerator } from '../bootstrap/generators/announcement.generator';
import { InitOptions } from './init.types';

/**
 * One-shot orchestrator for the production / dev game init.
 * Called from:
 *   - `scripts/init.ts` CLI (`pnpm init:run`).
 *   - `BootstrapService` when the system_config row is
 *     missing (auto-recover path, with sane defaults).
 *
 * The full init pipeline:
 *
 *   1. wipe            — drop every row from every game
 *                        table (only when `--force` or
 *                        `--wipe-only`)
 *   2. init_date       — write `system_config.init_date`
 *                        so later boots and the match
 *                        scheduler anchor on a stable
 *                        value
 *   3. leagues         — China I/II/III/IV pyramid (or
 *                        small pyramid under `--small`)
 *   4. teams           — 16 BOT teams per league, with
 *                        squad + staff + finance + fan
 *                        + stadium (via the shared
 *                        `createTeam` helper). Bot
 *                        teams have no owning user —
 *                        `team.userId` lands as null
 *                        for every row.
 *   5-9. parallel pass — presets / scout seeds /
 *                        schedule / weather /
 *                        announcements. Each reads
 *                        from the team + league tables
 *                        that steps 3-4 just populated
 *                        and writes to a disjoint table,
 *                        so they run in parallel via
 *                        `Promise.all`. Wall-clock
 *                        for the parallel pass is
 *                        `max(t_presets, t_scout,
 *                        t_schedule, t_weather,
 *                        t_announcement)` instead of
 *                        the sum.
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
  constructor(
    @Inject(LOGGER_SERVICE)
    private readonly logger: PinoLoggerService,
    private readonly dataSource: DataSource,
    private readonly leagueGenerator: LeagueGenerator,
    private readonly teamGenerator: TeamGenerator,
    private readonly scheduleGenerator: ScheduleGenerator,
    private readonly weatherGenerator: WeatherGenerator,
    private readonly tacticsPresetGenerator: TacticsPresetGenerator,
    private readonly scoutSeedGenerator: ScoutSeedGenerator,
    private readonly announcementGenerator: AnnouncementGenerator,
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

    // 3. leagues
    await this.leagueGenerator.generatePyramid({ small: options.small });
    this.logger.info('[Init] leagues ensured');

    // 4. teams (includes the post-enrichment pass for
    //    city, foundedYear, jerseyTertiary, eloRating,
    //    bio, and stadium.name). Bot teams have no
    //    owning user — `team.userId` lands as null
    //    for every row, no fake `bot_manager` user is
    //    created. The onboarding claim flow is the
    //    only path that flips a team to a real
    //    owner. See `CreateTeamParams.userId` for the
    //    rationale.
    await this.teamGenerator.generateAllTeams({
      small: options.small,
    });
    this.logger.info('[Init] teams ensured');

    // 5-9. presets / scout seeds / schedule / weather
    //     / announcements all read from the team +
    //     league tables that steps 3-4 just populated,
    //     and they each write to a disjoint table
    //     (`tactics_preset`, `scout_candidate`,
    //     `match`, `weather`, `announcement`). Run
    //     them in parallel via Promise.all instead
    //     of serially — for the full 1360-team
    //     pyramid, presets + scout seeds + schedule
    //     each take a few hundred ms on their own; the
    //     serial stack added up to ~2s of wall-clock
    //     on a `--force` init. Parallel: max(time).
    //
    //     Each generator's idempotency contract
    //     (every step is a no-op if its data is
    //     already present) makes the parallel pass
    //     safe across re-runs.
    const [
      presetsResult,
      scoutResult,
      scheduleResult,
      weatherResult,
      announcementResult,
    ] = await Promise.all([
      this.tacticsPresetGenerator
        .generate()
        .then(() => 'tactics presets'),
      this.scoutSeedGenerator
        .generate()
        .then(() => 'scout seeds'),
      this.scheduleGenerator
        .generateSeason1Schedule(options.initDate)
        .then(() => 'schedule'),
      this.weatherGenerator
        .generateInitialWeather(options.initDate)
        .then(() => 'weather'),
      this.announcementGenerator
        .generate(options.initDate)
        .then(() => 'announcements'),
    ]);
    this.logger.info(
      `[Init] parallel pass ensured (${[
        presetsResult,
        scoutResult,
        scheduleResult,
        weatherResult,
        announcementResult,
      ].join(', ')})`,
    );

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

  private async wipeAllData(): Promise<{ tables: number }> {
    // TRUNCATE … RESTART IDENTITY CASCADE in one shot.
    // Schema is preserved (we don't DROP) and the
    // RESTART IDENTITY resets any serial PKs so a fresh
    // init has monotonic ids again.
    //
    // We explicitly list every game-state table so we
    // don't accidentally truncate something we shouldn't
    // (e.g. `migrations`).
    //
    // Two categories of tables are INTENTIONALLY omitted:
    //
    //   1. Dictionary / reference data seeded by migrations
    //      and shared across all environments (dev / staging
    //      / prod) with stable, hand-assigned ids:
    //        - `event_class_def`       (RFC 0002, SMALLINT PKs)
    //        - `event_outcome_def`     (RFC 0002, SMALLINT PKs)
    //      Truncating them would force a reseed from the
    //      migration on every --force init and risk id drift
    //      between environments.
    //
    //   2. Append-only audit tables that must outlive init
    //      so historical traceability isn't lost on rebuild:
    //        - `player_history`
    //      The historical player-event log is informational
    //      only and a future "reset all game state" path
    //      should explicitly opt in to clearing it.
    //
    // Both omissions are documented here so a future
    // contributor doesn't "fix" the omission by adding them
    // back without understanding the consequences. The
    // source-level tripwire spec in `init.service.spec.ts`
    // pins this list so a drift on either side (missing
    // table or wrongly-added table) fails the test.
    const tables = [
      'match_event',
      'match_tactics',
      'match_team_stats',
      'match',
      'cup_bracket_slot',
      'cup_entry',
      'cup_round',
      'cup',
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
}

export interface InitResult {
  wiped: boolean;
  elapsedMs: number;
  leagues?: number;
  teams?: number;
  matches?: number;
}
