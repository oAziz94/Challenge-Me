import js from '@eslint/js';
import tseslint from 'typescript-eslint';

// Foundation Task 2 lint baseline (STACK-ADR-001 4.9): ESLint with typescript-eslint correctness rules.
// The custom rules of 4.7 (session-level SET, transaction across I/O, ...) are delivered by the tasks that own them.
export default tseslint.config(
  {
    ignores: [
      'node_modules/**',
      'docs/**',
      'coverage/**',
      'dist/**',
      'build/**',
      // The accepted, human-reviewed Task 1 protection scripts are outside the lint baseline: changing them to satisfy a
      // linter would be an unrequested change to an accepted protection mechanism. New files are linted by default.
      'scripts/governance/*.mjs',
      'scripts/governance/lib/**',
      'scripts/governance/test/**',
    ],
  },
  js.configs.recommended,
  {
    files: ['**/*.ts'],
    extends: [tseslint.configs.recommended],
  },
  {
    files: ['**/*.mjs', '**/*.js'],
    languageOptions: {
      sourceType: 'module',
      globals: {
        console: 'readonly',
        process: 'readonly',
        Buffer: 'readonly',
        fetch: 'readonly',
        AbortSignal: 'readonly',
        setTimeout: 'readonly',
        URL: 'readonly',
        structuredClone: 'readonly',
      },
    },
  },
  {
    files: ['**/*.cjs'],
    languageOptions: {
      sourceType: 'commonjs',
      globals: { module: 'writable', require: 'readonly', exports: 'writable', console: 'readonly', process: 'readonly' },
    },
  },
);
