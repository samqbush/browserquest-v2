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
      'bin/r.js',
      'client/js/lib/**',
      'client/js/build.js',
      'tools/**',
      '**/*.min.js',
    ],
  },

  // New code: tests run as ES modules, held to recommended rules as errors.
  {
    files: ['test/**/*.js', 'test/**/*.mjs'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { ...globals.node },
    },
    rules: js.configs.recommended.rules,
  },

  // Tooling/config files: CommonJS, Node globals.
  {
    files: ['eslint.config.js', 'vitest.config.js', '*.config.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'commonjs',
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

  // Legacy client: browser + RequireJS AMD with leaked globals.
  {
    files: ['client/**/*.js'],
    languageOptions: {
      ecmaVersion: 2018,
      sourceType: 'script',
      globals: {
        ...globals.browser,
        define: 'readonly',
        require: 'readonly',
        requirejs: 'readonly',
        Class: 'writable',
        Types: 'writable',
        Modernizr: 'readonly',
        _: 'readonly',
        $: 'readonly',
        jQuery: 'readonly',
        log: 'writable',
      },
    },
    rules: legacyWarnRules,
  },
];
