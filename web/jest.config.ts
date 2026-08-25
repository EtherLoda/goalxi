/**
 * Jest configuration for web/ unit tests.
 * Only tests pure functions (no React DOM, no jsdom).
 *
 * `.tsx` is intentionally allowed in `moduleFileExtensions` and the
 * transform so pure `.ts` helpers (e.g. `extract-key-events.ts`) can
 * import React component *identities* from a sibling `.tsx` file and
 * tests can assert `toBe(GoalCenterIcon)`. The spec files themselves
 * are still `.ts` (no JSX) and the test environment stays `node`
 * (no jsdom), so this doesn't widen the door to rendering tests —
 * it just lets the module graph cross the .ts / .tsx boundary for
 * type-level comparisons.
 */
import type { Config } from 'jest';

const config: Config = {
  rootDir: 'src',
  testEnvironment: 'node',
  testRegex: '.*\\.spec\\.ts$',
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        tsconfig: {
          // Match web/tsconfig.json but allow JS files; isolate from Next.js plugin
          target: 'ES2017',
          module: 'commonjs',
          moduleResolution: 'node',
          esModuleInterop: true,
          strict: true,
          skipLibCheck: true,
          jsx: 'react-jsx',
          isolatedModules: true,
          resolveJsonModule: true,
        },
      },
    ],
  },
  moduleFileExtensions: ['ts', 'tsx', 'js', 'json'],
  collectCoverageFrom: ['**/*.(t|j)s', '!**/*.spec.(t|j)s', '!**/*.d.ts'],
  coverageDirectory: '../../coverage/web',
  coverageReporters: ['text', 'lcov', 'html'],
  // Path alias mirror of tsconfig
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
  },
  testTimeout: 10000,
};

export default config;
