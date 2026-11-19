import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  { ignores: ['dist', 'node_modules', 'public/sw.js', 'coverage'] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      // Adoption baseline: this lint config is being introduced over an existing
      // codebase. Rules that would otherwise flag lots of pre-existing, working code
      // are surfaced as WARNINGS (not errors) so CI `eslint .` passes on errors only,
      // and the warnings can be burned down incrementally.
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/no-empty-object-type': 'warn',
      '@typescript-eslint/no-unused-expressions': 'warn',
      'no-empty': 'warn',
    },
  },
  // Couleur de statut employée comme TEXTE sans palier (`text-success`,
  // `hover:text-destructive`, `text-warning/80`…) : le DEFAULT est une couleur
  // d'accent, pas une couleur de texte garantie — `text-success` tombait à
  // 3,84:1. Écrire le palier explicite : `text-success-700`, `text-warning-700`,
  // `text-danger-700` (ou `-600`), `text-info-700`. Avertissement (et non
  // erreur) tant que les pages existantes n'ont pas migré.
  {
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['**/*.test.{ts,tsx}'],
    rules: {
      'no-restricted-syntax': [
        'warn',
        {
          selector: 'Literal[value=/(^|[\\s:])text-(success|warning|danger|info|destructive)(?![\\w-])/]',
          message:
            'Couleur de statut en texte sans palier : écrire text-success-700 / text-warning-700 / text-danger-700 / text-info-700 (contraste ≥ 4,5:1 dans les deux thèmes).',
        },
        {
          selector: 'TemplateElement[value.raw=/(^|[\\s:])text-(success|warning|danger|info|destructive)(?![\\w-])/]',
          message:
            'Couleur de statut en texte sans palier : écrire text-success-700 / text-warning-700 / text-danger-700 / text-info-700 (contraste ≥ 4,5:1 dans les deux thèmes).',
        },
      ],
    },
  },
  // Test files: allow node/vitest globals.
  {
    files: ['**/*.test.{ts,tsx}', 'src/test/**'],
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
  },
)
