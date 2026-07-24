// Flat config mínima: pega erro real sem brigar com estilo (Prettier cuida do estilo).
export default [
  {
    files: ['src/**/*.js', 'scripts/**/*.mjs', 'test/**/*.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { process: 'readonly', console: 'readonly', URL: 'readonly',
                 fetch: 'readonly', setTimeout: 'readonly', clearTimeout: 'readonly',
                 AbortController: 'readonly', Buffer: 'readonly' },
    },
    rules: {
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-undef': 'error',
      'no-var': 'error',
      'prefer-const': 'warn',
      eqeqeq: ['warn', 'smart'],
    },
  },
];
