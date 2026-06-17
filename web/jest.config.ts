/**
 * Jest configuration for web/ unit tests.
 * Only tests pure functions (no React DOM, no jsdom).
 */
import type { Config } from 'jest';

const config: Config = {
  rootDir: 'src',
  testEnvironment: 'node',
  testRegex: '.*\\.spec\\.ts$',
  transform: {
    '^.+\\.ts$': [
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
  moduleFileExtensions: ['ts', 'js', 'json'],
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
