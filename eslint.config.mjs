// For more info, see https://github.com/storybookjs/eslint-plugin-storybook#configuration-flat-config-format

import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';
import prettier from 'eslint-config-prettier';
import jsoncPlugin from 'eslint-plugin-jsonc';
import prettierPlugin from 'eslint-plugin-prettier';
import security from 'eslint-plugin-security';
import storybook from 'eslint-plugin-storybook';
import * as jsoncParser from 'jsonc-eslint-parser';
import tseslint from 'typescript-eslint';

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs.map((config) => ({
    ...config,
    files: ['**/*.ts', '**/*.tsx'],
  })),
  {
    files: ['**/*.ts', '**/*.tsx'],
    plugins: {
      importX: (await import('eslint-plugin-import-x')).default,
      prettier: prettierPlugin,
      '@typescript-eslint': tseslint.plugin,
    },
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        projectService: {
          allowDefaultProject: ['*.config.mjs'],
        },
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      'prettier/prettier': 'error',
      semi: ['error', 'always'],
      'no-restricted-syntax': [
        'warn',
        {
          selector:
            "CallExpression[callee.type='MemberExpression'][callee.computed=true][callee.property.type='Identifier']",
          message:
            'Avoid obj[dynamicKey]() bracket dispatch. Prefer an explicit switch or Record<AllowedKeys, fn> dispatch map so local lint catches the SEC-04 pattern before Codacy review.',
        },
      ],
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@/core/logger',
              message:
                "Import from '@/core/logger/client' or '@/core/logger/server' instead of the runtime selector.",
            },
          ],
        },
      ],
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-misused-promises': [
        'error',
        {
          checksVoidReturn: {
            arguments: false,
            attributes: true,
            inheritedMethods: false,
            properties: false,
            returns: false,
            variables: false,
          },
        },
      ],
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
      'importX/order': [
        'error',
        {
          groups: [
            'builtin',
            'external',
            'internal',
            'parent',
            'sibling',
            'index',
          ],
          pathGroups: [
            {
              pattern: '@/core/**',
              group: 'internal',
              position: 'before',
            },
            {
              pattern: '@/shared/**',
              group: 'internal',
              position: 'before',
            },
            {
              pattern: '@/features/**',
              group: 'internal',
              position: 'before',
            },
          ],
          pathGroupsExcludedImportTypes: ['builtin'],
          'newlines-between': 'always',
          alphabetize: {
            order: 'asc',
            caseInsensitive: true,
          },
        },
      ],
      '@typescript-eslint/no-deprecated': 'error',
    },
  },
  {
    files: ['src/app/**/*.{ts,tsx}', 'src/features/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@/core/logger',
              message:
                "Import from '@/core/logger/client' instead of the runtime selector.",
            },
            {
              name: '@/core/logger/server',
              message:
                "Server logger is not allowed in app/feature UI modules. Use '@/core/logger/client' or move code to a server-only module.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ['src/app/api/**/*.{ts,tsx}', 'src/proxy.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@/core/logger',
              message:
                "Import from '@/core/logger/server' instead of the runtime selector.",
            },
            {
              name: '@/core/logger/client',
              message:
                "Client logger is not allowed in server routes. Use '@/core/logger/server'.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ['**/*.js', '**/*.jsx', '**/*.mjs'],
    plugins: {
      importX: (await import('eslint-plugin-import-x')).default,
      prettier: prettierPlugin,
    },
    rules: {
      'prettier/prettier': 'error',
      semi: ['error', 'always'],
      'no-restricted-syntax': [
        'warn',
        {
          selector:
            "CallExpression[callee.type='MemberExpression'][callee.computed=true][callee.property.type='Identifier']",
          message:
            'Avoid obj[dynamicKey]() bracket dispatch. Prefer an explicit switch or Record<AllowedKeys, fn> dispatch map so local lint catches the SEC-04 pattern before Codacy review.',
        },
      ],
      'importX/order': [
        'error',
        {
          groups: [
            'builtin',
            'external',
            'internal',
            'parent',
            'sibling',
            'index',
          ],
          pathGroups: [
            {
              pattern: '@/core/**',
              group: 'internal',
              position: 'before',
            },
            {
              pattern: '@/shared/**',
              group: 'internal',
              position: 'before',
            },
            {
              pattern: '@/features/**',
              group: 'internal',
              position: 'before',
            },
          ],
          pathGroupsExcludedImportTypes: ['builtin'],
          'newlines-between': 'always',
          alphabetize: {
            order: 'asc',
            caseInsensitive: true,
          },
        },
      ],
    },
  },
  {
    files: ['scripts/**/*.{ts,tsx,js,jsx,mjs}', 'e2e/**/*.{ts,tsx,js,jsx,mjs}'],
    rules: {
      'no-restricted-syntax': [
        'warn',
        {
          selector:
            "MemberExpression[computed=true][property.type!='Literal'][object.type='MemberExpression'][object.object.name='process'][object.property.name='env']",
          message:
            'Avoid dynamic process.env[key] access in scripts and E2E helpers. Prefer an allowlisted helper or typed resolver so the access pattern is visible in local lint before review.',
        },
        {
          selector:
            ":matches(CallExpression[callee.type='MemberExpression'][callee.object.name='fs'][callee.property.name=/^(existsSync|readFileSync|writeFileSync|appendFileSync|copyFileSync|unlinkSync|rmSync|mkdirSync)$/], CallExpression[callee.type='Identifier'][callee.name=/^(existsSync|readFileSync|writeFileSync|appendFileSync|copyFileSync|unlinkSync|rmSync|mkdirSync)$/]) > Identifier.arguments:first-child",
          message:
            'Avoid passing a bare identifier path into fs.*Sync in scripts and E2E helpers. Prefer path.resolve(...) plus visible sink confinement so path provenance is obvious in local lint before review.',
        },
      ],
    },
  },
  ...jsoncPlugin.configs['flat/recommended-with-jsonc'],
  {
    files: ['**/*.json', '**/*.jsonc'],
    languageOptions: {
      parser: jsoncParser,
    },
    plugins: {
      prettier: prettierPlugin,
    },
    rules: {
      'prettier/prettier': 'error',
    },
  },
  security.configs.recommended,
  {
    // Reviewed confinement primitives: every fs.* call here is immediately
    // preceded by assertPathWithinBase() on the same value (OZI-42 Step 3A);
    // atomic-fs.ts is the ai-tooling-local counterpart to fs-guards-shared.ts
    // itself, not a consumer of it.
    files: [
      'scripts/lib/fs-guards-shared.ts',
      'scripts/lib/fs-guards.mjs',
      'scripts/ai-tooling/lib/atomic-fs.ts',
    ],
    rules: {
      'no-restricted-syntax': 'off',
      'security/detect-non-literal-fs-filename': 'off',
    },
  },
  {
    // Individually verified (OZI-42 Step 3C): every flagged path in exactly
    // these files traces to that same test's own mkdtempSync() result,
    // created in beforeEach and destroyed in afterEach — never a hardcoded,
    // env-derived, or otherwise externally-influenced path. A future test
    // file added to scripts/ai-tooling/lib/ is NOT automatically covered —
    // it must be individually verified and added to this exact list.
    files: [
      'scripts/ai-tooling/lib/atomic-fs.test.ts',
      'scripts/ai-tooling/lib/core-safety.test.ts',
      'scripts/ai-tooling/lib/create-mapping-sanitization.test.ts',
      'scripts/ai-tooling/lib/duplicate.test.ts',
      'scripts/ai-tooling/lib/fuzzy-and-audit.test.ts',
      'scripts/ai-tooling/lib/ledger.test.ts',
      'scripts/ai-tooling/lib/lock.concurrency.test.ts',
      'scripts/ai-tooling/lib/lock.test.ts',
      'scripts/ai-tooling/lib/reconcile.test.ts',
    ],
    rules: {
      'security/detect-non-literal-fs-filename': 'off',
      // Re-declared with only the process.env[key] selector kept — the
      // bare-identifier fs.*Sync selector is the one being exempted here;
      // every other restriction from the scripts/** block above still
      // applies to these files.
      'no-restricted-syntax': [
        'warn',
        {
          selector:
            "MemberExpression[computed=true][property.type!='Literal'][object.type='MemberExpression'][object.object.name='process'][object.property.name='env']",
          message:
            'Avoid dynamic process.env[key] access in scripts and E2E helpers. Prefer an allowlisted helper or typed resolver so the access pattern is visible in local lint before review.',
        },
      ],
    },
  },
  globalIgnores([
    '.git/**',
    '.next/**',
    '.vercel/**',
    'out/**',
    'build/**',
    'coverage/**',
    'logs/**',
    'playwright-report/**',
    'storybook-static/**',
    'test-results/**',
    'public/**',
    'src/stories/assets/**',
    'src/stories/**/*.css',
    '.zencoder/**',
    '.zenflow/**',
    'build-storybook.log',
    'debug-storybook.log',
    'next-env.d.ts',
    'node_modules/**',
    'docs/**/*.js',
  ]),
  prettier,
  ...storybook.configs['flat/recommended'],
]);

export default eslintConfig;
