/**
 * Init CLI — one-shot database initialization.
 *
 *   pnpm init:run --init-date=YYYY-MM-DD
 *   pnpm init:run --init-date=2026-09-09 --force
 *   pnpm init:run --wipe-only
 *   pnpm init:run --init-date=2026-09-09 --small
 *
 * Flags:
 *   --init-date   (required, unless --wipe-only)
 *                 ISO date `YYYY-MM-DD`. Stored in
 *                 `system_config.init_date` and used to
 *                 anchor the senior schedule (first match
 *                 = following Monday 00:00 UTC).
 *   --force       Drop every row from every game table
 *                 and rebuild from scratch. Default is
 *                 idempotent (no-op when data exists).
 *   --wipe-only   Drop every row and exit. The init date
 *                 is not required in this mode.
 *   --small       Build a 1 L1 + 1 L2 = 32-team pyramid
 *                 (local dev). Default is the full 85
 *                 leagues / 1360 teams pyramid.
 *   --help        Print this banner.
 *
 * Exit code:
 *   0  success
 *   1  user error (missing --init-date, unparseable date,
 *      init already done without --force)
 *   2  runtime error (DB connection, generator throw)
 */

import { parseArgs } from 'util';
import { DataSource } from 'typeorm';
import {
  SystemConfigEntity,
  SYSTEM_CONFIG_INIT_DATE_KEY,
  LeagueEntity,
  MatchEntity,
  UserEntity,
  PlayerEntity,
  StaffEntity,
  TeamEntity,
  WeatherEntity,
  startOfUtcDay,
  resolveGameStart,
} from '@goalxi/database';
import { DatabaseOptions } from '../src/config/database-options';
import { InitService } from '../src/init/init.service';
import { InitOptions } from '../src/init/init.types';
import { UserGenerator } from '../src/bootstrap/generators/user.generator';
import { LeagueGenerator } from '../src/bootstrap/generators/league.generator';
import { TeamGenerator } from '../src/bootstrap/generators/team.generator';
import { ScheduleGenerator } from '../src/bootstrap/generators/schedule.generator';
import { WeatherGenerator } from '../src/bootstrap/generators/weather.generator';

function printHelp(): void {
  // eslint-disable-next-line no-console
  console.log(
    [
      'Init CLI — one-shot database initialization.',
      '',
      'Usage:',
      '  pnpm init:run --init-date=YYYY-MM-DD',
      '  pnpm init:run --init-date=2026-09-09 --force',
      '  pnpm init:run --wipe-only',
      '  pnpm init:run --init-date=2026-09-09 --small',
      '',
      'Flags:',
      '  --init-date   ISO date YYYY-MM-DD. Required unless --wipe-only.',
      '  --force       Drop every row and rebuild.',
      '  --wipe-only   Drop every row and exit.',
      '  --small       1 L1 + 1 L2 = 32 teams (dev).',
      '  --help        Print this banner.',
    ].join('\n'),
  );
}

interface CliArgs {
  initDate?: string;
  force: boolean;
  wipeOnly: boolean;
  small: boolean;
  help: boolean;
}

function parseCli(argv: readonly string[]): CliArgs {
  const { values } = parseArgs({
    options: {
      'init-date': { type: 'string' },
      force: { type: 'boolean', default: false },
      'wipe-only': { type: 'boolean', default: false },
      small: { type: 'boolean', default: false },
      help: { type: 'boolean', short: 'h', default: false },
    },
    allowPositionals: false,
    strict: true,
  });
  return {
    initDate: values['init-date'] as string | undefined,
    force: Boolean(values.force),
    wipeOnly: Boolean(values['wipe-only']),
    small: Boolean(values.small),
    help: Boolean(values.help),
  };
}

function resolveInitDate(raw: string | undefined): Date | null {
  if (!raw || raw.trim().length === 0) {
    return null;
  }
  // Accept both `YYYY-MM-DD` and full ISO timestamps.
  const parsed = new Date(raw);
  if (isNaN(parsed.getTime())) {
    return null;
  }
  return startOfUtcDay(parsed);
}

async function hasExistingInit(dataSource: DataSource): Promise<boolean> {
  const repo = dataSource.getRepository(SystemConfigEntity);
  const row = await repo.findOne({
    where: { key: SYSTEM_CONFIG_INIT_DATE_KEY },
  });
  if (row) {
    return true;
  }
  // Fallback: if any league already exists, the DB has
  // been initialized under an older scheme. Treat as
  // "already initialized" so a bare `pnpm init:run`
  // without --force refuses to no-op silently.
  const leagueCount = await dataSource
    .getRepository(LeagueEntity)
    .createQueryBuilder('l')
    .getCount();
  return leagueCount > 0;
}

// Plain console-logging shim matching the
// `PinoLoggerService` shape the InitService expects.
// The CLI runs outside the Nest DI container so we
// can't pull the real logger; a 1-line `info` shim is
// enough for the init flow's debug output.
const consoleLogger = {
  info: (m: string) => console.log(m),
  warn: (m: string) => console.warn(m),
  error: (m: string) => console.error(m),
  debug: (_m: string) => undefined,
};

async function main(): Promise<number> {
  const args = parseCli(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return 0;
  }

  const initDate = resolveInitDate(args.initDate);
  if (!args.wipeOnly && !initDate) {
    // eslint-disable-next-line no-console
    console.error(
      '[init] --init-date is required (YYYY-MM-DD). ' +
        'Use --wipe-only if you only want to drop data.',
    );
    return 1;
  }

  // Use the env-fallback resolver when the date is missing
  // (wipe-only path). We never call this for the rebuild
  // path because the date is required there.
  const resolvedInitDate =
    initDate ?? resolveGameStart(process.env.GAME_START_DATE);

  // eslint-disable-next-line no-console
  console.log(
    `[init] connecting to ${process.env.DATABASE_HOST ?? 'localhost'}:${process.env.DATABASE_PORT ?? '5432'}/${process.env.DATABASE_NAME ?? '<db>'}...`,
  );
  const dataSource = new DataSource(DatabaseOptions.build() as any);
  await dataSource.initialize();
  // eslint-disable-next-line no-console
  console.log('[init] connected');

  try {
    if (!args.force && !args.wipeOnly) {
      const already = await hasExistingInit(dataSource);
      if (already) {
        // eslint-disable-next-line no-console
        console.error(
          '[init] DB already initialized. Re-run with --force to wipe + rebuild.',
        );
        return 1;
      }
    }

    // Hand-roll the InitService collaborators from the
    // raw DataSource. The CLI runs outside the Nest DI
    // container, so we instantiate each generator with
    // its repository + the console logger.
    const ds = dataSource;
    const userGen = new UserGenerator(
      consoleLogger as any,
      ds.getRepository(UserEntity),
    );
    const leagueGen = new LeagueGenerator(
      consoleLogger as any,
      ds.getRepository(LeagueEntity),
    );
    const teamGen = new TeamGenerator(
      consoleLogger as any,
      ds.getRepository(TeamEntity),
      ds.getRepository(PlayerEntity),
      ds.getRepository(StaffEntity),
      ds.getRepository(LeagueEntity),
      ds,
    );
    const scheduleGen = new ScheduleGenerator(
      consoleLogger as any,
      ds.getRepository(MatchEntity),
      ds.getRepository(LeagueEntity),
      ds.getRepository(TeamEntity),
    );
    const weatherGen = new WeatherGenerator(
      consoleLogger as any,
      ds.getRepository(WeatherEntity),
    );

    const svc = new InitService(
      consoleLogger as any,
      ds,
      userGen,
      leagueGen,
      teamGen,
      scheduleGen,
      weatherGen,
    );

    const options: InitOptions = {
      initDate: resolvedInitDate,
      force: args.force,
      wipeOnly: args.wipeOnly,
      small: args.small,
    };
    const result = await svc.run(options);
    // eslint-disable-next-line no-console
    console.log(
      `[init] ✅ done in ${result.elapsedMs}ms` +
        (result.leagues !== undefined
          ? ` — ${result.leagues} leagues, ${result.teams} teams, ${result.matches} matches`
          : ''),
    );
    return 0;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[init] ❌ failed:', err);
    return 2;
  } finally {
    await dataSource.destroy();
  }
}

main().then(
  (code) => process.exit(code),
  (err) => {
    // eslint-disable-next-line no-console
    console.error('[init] ❌ uncaught:', err);
    process.exit(2);
  },
);
