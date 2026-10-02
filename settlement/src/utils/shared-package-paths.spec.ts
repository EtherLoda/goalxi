import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * The jest configs point `@goalxi/database` / `@goalxi/logger` at `src/`
 * so that tests read the source of truth instead of a possibly stale
 * `dist/`. See `api/tsconfig.spec.json` for the full rationale.
 *
 * ## Why a drift test is needed
 *
 * TypeScript's `extends` REPLACES `compilerOptions.paths` rather than
 * merging it. `tsconfig.spec.json` therefore has to restate every `@/*`
 * alias from `tsconfig.json` just to change the two shared-package
 * entries — and TypeScript does not merge `paths` either, so a missing
 * alias surfaces only as a wall of `TS2307: Cannot find module '@/…'`
 * at test time, not at build time.
 *
 * Nothing else in the repo would catch that drift: `nest build` reads
 * `tsconfig.json`, not `tsconfig.spec.json`.
 */
const API_DIR = join(__dirname, '..', '..', '..', 'api');

const readJson = (file: string) =>
  JSON.parse(readFileSync(file, 'utf8').replace(/^\s*\/\/.*$/gm, ''));

describe('shared-package path resolution (wiring tripwire)', () => {
  const base = readJson(join(API_DIR, 'tsconfig.json'));
  const spec = readJson(join(API_DIR, 'tsconfig.spec.json'));
  const jest = readJson(join(API_DIR, 'jest.config.json'));

  it('tsconfig.spec.json extends the build tsconfig', () => {
    // If these diverge, `nest build` and `jest` compile different code.
    expect(spec.extends).toBe('./tsconfig.json');
  });

  it('type-resolves the shared packages to src, not dist', () => {
    for (const pkg of ['@goalxi/database', '@goalxi/logger']) {
      expect(spec.compilerOptions.paths[pkg]).toEqual([
        `../libs/${pkg.split('/')[1]}/src`,
      ]);
      expect(base.compilerOptions.paths[pkg]).toEqual([
        `../libs/${pkg.split('/')[1]}/dist`,
      ]);
    }
  });

  it('leaves the BUILD tsconfig pointing at dist', () => {
    // The build must keep using dist: swc emits per-file and resolves
    // imports through these paths, so pointing it at src would leave
    // api's dist requiring `.ts` files from a sibling package.
    expect(base.compilerOptions.paths['@goalxi/database']).toEqual([
      '../libs/database/dist',
    ]);
    expect(base.compilerOptions.paths['@goalxi/logger']).toEqual([
      '../libs/logger/dist',
    ]);
  });

  it('restates every @/* alias from the base tsconfig', () => {
    // The duplication is forced by `extends` semantics; this is what
    // stops the two copies from drifting.
    const aliases = Object.keys(base.compilerOptions.paths).filter((k) =>
      k.startsWith('@/'),
    );
    const missing = aliases.filter((k) => !spec.compilerOptions.paths[k]);

    expect(missing).toEqual([]);
    expect(aliases.length).toBeGreaterThan(10);
  });

  it('adds no @/* alias that the base does not have', () => {
    // Guards the other direction: a typo'd alias would silently shadow a
    // real module path.
    const extra = Object.keys(spec.compilerOptions.paths).filter(
      (k) => k.startsWith('@/') && !base.compilerOptions.paths[k],
    );
    expect(extra).toEqual([]);
  });

  it('points jest runtime resolution at the same src paths', () => {
    // tsconfig fixes TYPES, moduleNameMapper fixes `require`. Missing
    // either half reintroduces the bug from one side.
    expect(jest.moduleNameMapper['^@goalxi/database$']).toBe(
      '<rootDir>/../../libs/database/src',
    );
    expect(jest.moduleNameMapper['^@goalxi/logger$']).toBe(
      '<rootDir>/../../libs/logger/src',
    );
  });

  it('hands ts-jest the spec tsconfig', () => {
    const transform = jest.transform['^.+\\.(t|j)s$'];
    const opts = Array.isArray(transform) ? transform[1] : undefined;
    expect(opts?.tsconfig).toBe('<rootDir>/../tsconfig.spec.json');
  });

  it('no longer maps settlement into the api build', () => {
    // Phase 0 removed the cross-package import of settlement's
    // SchedulerModule. A leftover mapping would let it creep back.
    expect(
      jest.moduleNameMapper['^settlement/scheduler/(.*)$'],
    ).toBeUndefined();
    expect(base.compilerOptions.paths['settlement']).toBeUndefined();
    expect(base.compilerOptions.paths['settlement/*']).toBeUndefined();
  });
});
