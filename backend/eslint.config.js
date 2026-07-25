// Flat config (ESLint v9+). Replaces the legacy .eslintrc.json.
// Built from the installed @typescript-eslint plugin + parser only — no extra
// preset packages required. Rules mirror the prior eslintrc: warning-tuned so
// `eslint src/` passes on errors only and warnings can be burned down over time.
const tsplugin = require('@typescript-eslint/eslint-plugin');
const tsparser = require('@typescript-eslint/parser');

module.exports = [
  { ignores: ['dist/', 'node_modules/', 'coverage/', '**/*.mjs'] },
  {
    files: ['**/*.ts'],
    languageOptions: {
      parser: tsparser,
      ecmaVersion: 2022,
      sourceType: 'module',
    },
    plugins: { '@typescript-eslint': tsplugin },
    rules: {
      ...(tsplugin.configs.recommended.rules || {}),
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': ['warn', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        ignoreRestSiblings: true,
      }],
      'no-console': 'warn',
    },
  },
];
