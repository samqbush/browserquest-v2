const js = require('@eslint/js');
const globals = require('globals');

// Lenient legacy gate: the 2012 codebase leaks implicit globals (log, Types,
// Class, _) and predates ESLint. We declare those globals and downgrade noisy
// rules to "warn" so CI stays green on legacy code, while new code (tests +
// tooling) is held to the recommended ruleset as errors.
const legacyWarnRules = {
  'no-unused-vars': 'warn',
  'no-undef': 'warn',
  'no-empty': 'warn',
  'no-redeclare': 'warn',
  'no-fallthrough': 'warn',
  'no-cond-assign': 'warn',
  'no-prototype-builtins': 'warn',
};

module.exports = [
  {
    ignores: [
      'node_modules/**',
      'client-build/**',
      'dist/**',
      'client/dist/**',
      'playwright-report/**',
      'test-results/**',
      'bin/r.js',
      'client/js/lib/**',
      'client/js/build.js',
      'tools/**',
      '**/*.min.js',
      // TypeScript ambient declarations (Phase 5): espree cannot parse .d.ts
      // syntax (declare/export =). Type-checking is handled by `tsc`, not lint.
      '**/*.d.ts',
    ],
  },

  // New code: tests run as ES modules, held to recommended rules as errors.
  {
    files: ['test/**/*.js', 'test/**/*.mjs', 'tests/**/*.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { ...globals.node, ...globals.browser },
    },
    rules: js.configs.recommended.rules,
  },

  // CommonJS tooling/config files (use require()).
  {
    files: ['eslint.config.js', 'vitest.config.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'commonjs',
      globals: { ...globals.node },
    },
    rules: js.configs.recommended.rules,
  },

  // ESM tooling/config files (Vite + Playwright use import/export and
  // import.meta).
  {
    files: ['vite.config.js', 'playwright.config.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { ...globals.node },
    },
    rules: js.configs.recommended.rules,
  },

  // Legacy server + shared: CommonJS with leaked globals.
  {
    files: ['server/**/*.js', 'shared/**/*.js'],
    languageOptions: {
      ecmaVersion: 2018,
      sourceType: 'commonjs',
      globals: {
        ...globals.node,
        _: 'readonly',
        log: 'writable',
        Types: 'writable',
        Class: 'writable',
        FormatChecker: 'writable',
      },
    },
    rules: legacyWarnRules,
  },

  // Phase 2 client: full ESM modules (Vite). Implicit globals are real bugs
  // under module strict mode, so no-undef is an error here. Only genuinely
  // global symbols are the classic pre-entry libs (Detect/Modernizr) loaded
  // via <script> tags before the module entry.
  {
    files: ['client/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.worker,
        Detect: 'readonly',
        Modernizr: 'readonly',
        // Globals installed on `window` by util.js (imported for side effects).
        isInt: 'readonly',
        TRANSITIONEND: 'readonly',
        requestAnimFrame: 'readonly',
        // Legacy browser transport global (guarded fallback in gameclient.js).
        MozWebSocket: 'readonly',
      },
    },
    rules: {
      ...legacyWarnRules,
      'no-undef': 'error',
    },
  },
];
