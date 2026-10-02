import eslint from '@eslint/js';
import prettierRecommended from 'eslint-plugin-prettier/recommended';
import tsEslint from 'typescript-eslint';

export default tsEslint.config(
  // GLOBAL ignores.
  //
  // This block must contain `ignores` and NOTHING else. In ESLint flat
  // config, a config object whose only key is `ignores` is a "global
  // ignore"; adding any other key (`rules`, `languageOptions`, …) makes
  // `ignores` apply only to that one block instead of to every block.
  //
  // `src/generated/i18n.generated.ts` used to be listed alongside
  // `rules`, so it was still linted by `eslint.configs.recommended`,
  // `tsEslint.configs.recommended` and `prettierRecommended`. That
  // produced an unbreakable loop:
  //
  //   1. nestjs-i18n regenerates the file at boot (`typesOutputPath` in
  //      `src/utils/modules-set.ts`) with its `/* eslint-disable */`
  //      header;
  //   2. `pnpm lint` runs `eslint --fix`, and ESLint drops directive
  //      comments when it rewrites a file — so the header disappears
  //      (with no diagnostic reported, which is why it was invisible);
  //   3. the next dev boot writes the header back.
  //
  // The file is generated and marked `DO NOT EDIT`; linting it is
  // meaningless and rewriting it is destructive. Keep it out of lint.
  {
    ignores: [
      'eslint.config.mjs',
      'docs/.vuepress/**/*',
      'src/generated/i18n.generated.ts',
    ],
  },
  eslint.configs.recommended,
  ...tsEslint.configs.recommended,
  prettierRecommended,
  {
    languageOptions: {
      parserOptions: {
        project: './tsconfig.json',
        tsconfigRootDir: import.meta.dirname,
        sourceType: 'module',
      },
    },
    rules: {
      '@typescript-eslint/interface-name-prefix': 'off',
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
    },
  },
);
