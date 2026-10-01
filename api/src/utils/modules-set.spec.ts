import { ConfigModule } from '@nestjs/config';
import { readFileSync } from 'fs';
import { join } from 'path';
import { ApiModule } from '../api/api.module';
import { MailModule } from '../mail/mail.module';
import generateModulesSet from './modules-set';

// `@nestjs/config@3` returns `Promise<DynamicModule>` from
// `ConfigModule.forRoot()` (see node_modules/@nestjs/config/dist/config.module.d.ts).
// `generateModulesSet()` puts that Promise at index 0 of the imports array, so we
// resolve the thenables before asserting on the module shape.
const loadModules = async () => Promise.all(await generateModulesSet());

const loadModulesFor = async (set: string) => {
  process.env.MODULES_SET = set;
  return loadModules();
};

describe('generateModulesSet', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should return correct modules for monolith set', async () => {
    process.env.MODULES_SET = 'monolith';
    const modules = await loadModules();
    expect(modules).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          module: ConfigModule,
        }), // ConfigModule
        ApiModule,
        expect.any(Object), // BullModule
        expect.any(Object), // BackgroundModule
        expect.any(Object), // TypeOrmModule
        expect.any(Object), // I18nModule
        expect.any(Object), // LoggerModule
        MailModule,
      ]),
    );
  });

  // The default must be `api`, NOT `monolith`. `monolith` used to boot
  // settlement's ~26 `@Cron` handlers in-process (via a cross-package
  // import of `settlement/dist`), which meant every default deployment
  // ran each settlement cron twice — see
  // `api/src/background/background.module.ts`. Regression guard: if the
  // default is ever flipped back, this test fails.
  it('should default to the api set, never monolith', async () => {
    delete process.env.MODULES_SET;
    const modules = await loadModules();
    expect(modules).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ module: ConfigModule }),
        ApiModule,
        MailModule,
      ]),
    );
  });

  // `monolith` is now a pure alias of `api`. If someone reintroduces a
  // difference between the two branches, this test fails — that
  // difference is exactly what caused the cron double-run.
  //
  // Compares the *module identities*, not the resolved objects: each
  // `generateModulesSet()` call builds fresh providers (TypeOrmModule
  // mints a random `TypeOrmModuleId`, I18nModule a fresh logger), so a
  // deep-equality check would fail for reasons unrelated to the
  // invariant under test.
  it('should treat monolith as an exact alias of api', async () => {
    const identityOf = async (set: string) =>
      (await loadModulesFor(set)).map((entry: unknown) => {
        // Entries are either a bare module class (`ApiModule`) or a
        // resolved DynamicModule (`{ module: ConfigModule, ... }`).
        const mod =
          entry && typeof entry === 'object' && 'module' in entry
            ? (entry as { module: unknown }).module
            : entry;
        return typeof mod === 'function' ? mod.name : String(mod);
      });

    expect(await identityOf('monolith')).toEqual(await identityOf('api'));
  });

  // Belt-and-braces on the actual invariant: `BackgroundModule` must
  // not reach into the settlement workspace. Asserted against the
  // SOURCE rather than by `require`-ing `settlement/dist` — resolving
  // the real module would itself reintroduce the build-order coupling
  // this test exists to prevent, and would fail whenever settlement
  // hasn't been built.
  it('should not reference the settlement workspace from BackgroundModule', () => {
    const source = readFileSync(
      join(__dirname, '..', 'background', 'background.module.ts'),
      'utf8',
    );

    // Strip comments so the explanatory comment block (which names the
    // removed import) doesn't trip the assertion.
    const code = source
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');

    // Match the *cross-package* reference only. The `(?!\.\/)` lookahead
    // skips local relative imports so the legitimate api-owned
    // `./queues/finance-settlement/...` is not a false positive, while
    // `../../../settlement/dist/...` still matches.
    expect(code).not.toMatch(/from\s+['"](?!\.\/)[^'"]*settlement/);
    expect(code).not.toMatch(/\.\.\/settlement/);
    expect(code).not.toMatch(/SettlementSchedulerModule/);
    expect(code).not.toMatch(/\bSchedulerModule\b/);
  });

  it('should return correct modules for api set', async () => {
    process.env.MODULES_SET = 'api';
    const modules = await loadModules();
    expect(modules).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          module: ConfigModule,
        }), // ConfigModule
        ApiModule,
        expect.any(Object), // BullModule
        expect.any(Object), // BackgroundModule
        expect.any(Object), // TypeOrmModule
        expect.any(Object), // I18nModule
        expect.any(Object), // LoggerModule
        MailModule,
      ]),
    );
  });

  it('should return correct modules for background set', async () => {
    process.env.MODULES_SET = 'background';
    const modules = await loadModules();
    expect(modules).toEqual(
      expect.arrayContaining([
        expect.any(Object), // BullModule
        expect.any(Object), // BackgroundModule
        expect.any(Object), // TypeOrmModule
        expect.any(Object), // I18nModule
        expect.any(Object), // LoggerModule
      ]),
    );
  });

  // An unrecognised `MODULES_SET` must fail the boot. It used to log to
  // stderr and return a near-empty module list, so a typo produced a
  // process that started cleanly and served nothing — diagnosed hours
  // later, if at all.
  it('should throw on an unsupported modules set', async () => {
    process.env.MODULES_SET = 'unsupported';
    await expect(loadModules()).rejects.toThrow(
      /Unsupported modules set: unsupported/,
    );
  });
});
