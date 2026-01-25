// For more info, see https://github.com/storybookjs/eslint-plugin-storybook#configuration-flat-config-format

import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';
import prettier from 'eslint-config-prettier';
import jsoncPlugin from 'eslint-plugin-jsonc';
import prettierPlugin from 'eslint-plugin-prettier';
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
      '@typescript-eslint/consistent-type-imports': 'error',
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
  globalIgnores([
    '.git/**',
    '.next/**',
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
  ]),
  prettier,
  ...storybook.configs['flat/recommended'],
]);

export default eslintConfig;
