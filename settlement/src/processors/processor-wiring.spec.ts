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