import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';

const PROCESSORS_DIR = join(__dirname, '..', 'processors');

/**
 * Every `@Processor('<queue>')` class in settlement must be registered as a
 * provider in some `@Module` — otherwise it never becomes a live BullMQ
 * worker.
 *
 * ## Why this test exists
 *
 * `ConditionProcessor` was decorated `@Processor('condition-settlement')`,
 * had a passing spec, and its queue was registered — but the class was in
 * NO module's `providers` array. It was therefore dead code: a job was
 * enqueued every Thursday and sat in Redis `wait` forever.
 *
 * The blast radius was invisible from unit tests because
 * `condition.processor.spec.ts` builds its own `TestingModule`, so the
 * app-level wiring was never exercised. Two real consequences:
 *
 *   - `player.form` never converged. Not cosmetic — the simulator reads
 *     it in five places (`simulator/src/engine/classes/Team.ts`,
 *     `match.engine.ts`), so every player's form was frozen at its seeded
 *     value.
 *   - `player.matchMinutes` was never reset, so it grew without bound
 *     (incremented per match in `match-completion.service.ts`).
 *
 * A missing provider is invisible at compile time and to any spec that
 * doesn't boot `AppModule`. This test closes that gap.
 */
describe('settlement processor registration (wiring tripwire)', () => {
  const moduleFiles = collectFiles(join(__dirname, '..'), '.module.ts');

  it('found the module files to scan (sanity check on the glob)', () => {
    expect(moduleFiles.length).toBeGreaterThan(5);
  });

  it('every @Processor class is registered in some module providers array', () => {
    const processorClasses = findProcessorClasses(PROCESSORS_DIR);
    expect(processorClasses.length).toBeGreaterThan(0);

    const moduleSources = moduleFiles.map((f) =>
    stripComments(readFileSync(f, 'utf8')),
  );

    const unregistered = processorClasses.filter(
      ({ className }) =>
        !moduleSources.some(
          (src) => new RegExp(`providers:\\s*\\[[^\\]]*\\b${className}\\b`, 's').test(src),
        ),
    );

    expect(
      unregistered.map((u) => `${u.className} (queue: ${u.queue})`),
    ).toEqual([]);
  });

  it('no two processors declare the same queue (BullMQ workers compete, not broadcast)', () => {
    // Two `@Processor` decorators on one queue means each job is handled
    // by exactly ONE of them. The `match-completion` collision between
    // settlement's `CupProgressProcessor` and the API's
    // `MatchCompletionProcessor` meant roughly half of all matches were
    // either bracket-advanced-without-settlement or
    // settled-without-bracket-advance. Cup progression now lives on its
    // own `cup-progress` queue.
    //
    // Cross-service consumers (the API owns `match-completion`) are out
    // of scope for this file-level scan; the ones we can see are here.
    const processors = findProcessorClasses(PROCESSORS_DIR);

    const byQueue = new Map<string, string[]>();
    for (const { className, queue } of processors) {
      const list = byQueue.get(queue) ?? [];
      list.push(className);
      byQueue.set(queue, list);
    }

    const collisions = [...byQueue.entries()]
      .filter(([, classes]) => classes.length > 1)
      .map(([queue, classes]) => `${queue}: ${classes.join(', ')}`);

    expect(collisions).toEqual([]);
  });
});

describe('settlement cron timezone (wiring tripwire)', () => {
  const schedulerFiles = collectFiles(
    join(__dirname, '..', 'scheduler'),
    '.service.ts',
  );

  it('found the scheduler services to scan (sanity check on the glob)', () => {
    expect(schedulerFiles.length).toBeGreaterThan(5);
  });

  it('every @Cron pins timeZone to GAME_SETTINGS.CRON_TIME_ZONE', () => {
    // `@nestjs/schedule` passes decorator options straight to
    // `CronJob.from`, which defaults to the SERVER's local timezone.
    // Every cron here is written and commented as UTC, and the whole
    // season/week grid (`currentSeasonWeek`) is anchored on a UTC-Monday
    // boundary — so on a non-UTC host the weekly triggers drift by up to
    // a day and can fire on the wrong weekday. It worked only because
    // `settlement/Dockerfile` uses node:20-alpine (UTC) and compose sets
    // no TZ, which is an undocumented load-bearing assumption.
    const offenders: string[] = [];

    for (const file of schedulerFiles) {
      const src = stripComments(readFileSync(file, 'utf8'));
      const re = /@Cron\(\s*['"`][^'"`]+['"`]\s*(\)|,)/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(src)) !== null) {
        const rest = src.slice(m.index + m[0].length - 1);
        if (!/^\s*,\s*\{[^}]*timeZone:\s*GAME_SETTINGS\.CRON_TIME_ZONE/.test(rest)) {
          offenders.push(`${file}: ${m[0].replace(/\s+/g, ' ')}`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });

  it('found at least one @Cron to scan', () => {
    const total = schedulerFiles.reduce(
      (n, f) => (n + (stripComments(readFileSync(f, 'utf8')).match(/@Cron\(/g) ?? []).length),
      0,
    );
    expect(total).toBeGreaterThan(5);
  });
});

/**
 * Cron mutual exclusion.
 *
 * ## Why this test exists
 *
 * Until Phase 0 the api process imported settlement's compiled
 * `SchedulerModule` and booted these handlers too, so every settlement
 * cron fired twice in two processes. Nothing stopped the second run, and
 * the handlers with multi-step unwrapped writes had no database guard:
 *
 *   - `season-transition` `checkAndProcessSeasonStart` — 5 ordered
 *     steps; its own comment notes a mid-sequence failure re-runs
 *     promotions and UN-SWAPs every pair on the next tick
 *   - `promotion-relegation` `processAllTiers` — 5+ unwrapped writes,
 *     `swapTeamLeague` is not commutative
 *   - `league-standing` `initNewSeasonStandings` — per-row saves
 *
 * Phase 0 removed the second owner. `@CronLocked` (backed by a Redis
 * `SET NX PX` with a token-checked release) closes the general case:
 * two settlement replicas, a restart mid-tick, or a slow tick
 * overlapping the next.
 *
 * This tripwire exists because the lock is invisible to unit tests —
 * every scheduler spec injects a pass-through runner, so a cron that
 * silently lost its `@CronLocked` would still pass all of them.
 */
describe('settlement cron locking (wiring tripwire)', () => {
  const schedulerFiles = collectFiles(
    join(__dirname, '..', 'scheduler'),
    '.service.ts',
  );

  it('every @Cron handler is wrapped by @CronLocked', () => {
    const offenders: string[] = [];

    for (const file of schedulerFiles) {
      const src = stripComments(readFileSync(file, 'utf8'));
      const lines = src.split('\n');
      lines.forEach((line, i) => {
        if (!/^\s*@Cron\(/.test(line)) return;
        // Decorators apply bottom-up, so `@CronLocked` MUST be the line
        // directly below `@Cron`. If it is above, `@Cron` attaches its
        // metadata to the INNER method, Nest schedules the unguarded
        // original, and the lock is decorative.
        const next = lines[i + 1] ?? '';
        if (!/@CronLocked\(/.test(next)) {
          offenders.push(
            `${relative(file)}:${i + 1} — @Cron without @CronLocked directly below it`,
          );
        }
      });
    }

    expect(offenders).toEqual([]);
  });

  it('found the @Cron handlers to scan (sanity check on the scan)', () => {
    let count = 0;
    for (const file of schedulerFiles) {
      const src = stripComments(readFileSync(file, 'utf8'));
      count += (src.match(/^\s*@Cron\(/gm) ?? []).length;
    }
    expect(count).toBeGreaterThanOrEqual(15);
  });

  it('no two crons take the same lock unless they are declared as one group', () => {
    // Two independent crons sharing a lock name would serialise: the
    // second would observe the lock held and SKIP its tick. Four crons
    // fire at exactly `0 0 0 * * 1` (finance, senior-decline, and two
    // season-transition), so this is a live hazard rather than a
    // theoretical one.
    //
    // `settlement.season-transition` is the intentional exception: the
    // three crons are steps of ONE season state machine and must not
    // interleave. It is declared once here as a known-shared group.
    const INTENTIONAL_SHARED = new Set(['settlement.season-transition']);

    const byLock = new Map<string, string[]>();
    for (const file of schedulerFiles) {
      const src = stripComments(readFileSync(file, 'utf8'));
      const re = /@CronLocked\(\s*['"`]([^'"`]+)['"`]/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(src)) !== null) {
        const list = byLock.get(m[1]) ?? [];
        list.push(`${relative(file)}`);
        byLock.set(m[1], list);
      }
    }

    const collisions = [...byLock.entries()]
      .filter(([lock, sites]) => sites.length > 1 && !INTENTIONAL_SHARED.has(lock))
      .map(
        ([lock, sites]) =>
          `${lock} taken by ${sites.length} crons: ${sites.join(', ')}`,
      );

    expect(collisions).toEqual([]);
  });

  it('every @CronLocked declares a positive ttlMs', () => {
    // A TTL of 0 or a negative value makes `SET ... PX 0` expire
    // immediately, so the lock would never actually exclude anyone.
    const offenders: string[] = [];
    const re =
      /@CronLocked\(\s*['"`]([^'"`]+)['"`]\s*,\s*\{\s*ttlMs:\s*([^}]+?)\s*\}\s*\)/g;

    for (const file of schedulerFiles) {
      const src = stripComments(readFileSync(file, 'utf8'));
      let m: RegExpExecArray | null;
      while ((m = re.exec(src)) !== null) {
        const [, name, expr] = m;
        // Every declaration is a `<n> * 60_000`-style literal; assert it
        // is a multiplication rather than a bare number so nobody writes
        // `ttlMs: 60` and silently gets a 60 ms lock.
        if (!/^\d+\s*\*\s*[\d_]+\s*$/.test(expr.trim())) {
          offenders.push(`${relative(file)} — ${name}: ttlMs: ${expr.trim()}`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });
});

function collectFiles(dir: string, suffix: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === 'dist') continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...collectFiles(full, suffix));
    } else if (full.endsWith(suffix)) {
      out.push(full);
    }
  }
  return out;
}

/**
 * Find `@Processor('queue')` decorators and the class name they sit on.
 * Crude but sufficient: the codebase uses one decorator per class and a
 * consistent `export class X ... extends WorkerHost` shape.
 */
function findProcessorClasses(dir: string): {
  className: string;
  queue: string;
  file: string;
}[] {
  const out: { className: string; queue: string; file: string }[] = [];

  for (const file of collectFiles(dir, '.processor.ts')) {
    const src = stripComments(readFileSync(file, 'utf8'));
    const re = /@Processor\(\s*['"`]([^'"`]+)['"`]/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(src)) !== null) {
      const queue = m[1];
      // Find the first `export class <Name>` after the decorator.
      const tail = src.slice(m.index);
      const cls = tail.match(/export\s+class\s+(\w+)/);
      if (cls) {
        out.push({ className: cls[1], queue, file });
      }
    }
  }

  return out;
}

/**
 * Drop block and line comments so a `@Processor('...')` mentioned in a
 * doc comment isn't mistaken for a real decorator. Naive (no string
 * awareness) but adequate: these files don't embed comment-terminator
 * sequences inside string literals.
 */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

/** Repo-relative path, so assertion failures are clickable. */
function relative(full: string): string {
  return full.replace(/\\/g, '/').split('/settlement/').slice(-1)[0];
}