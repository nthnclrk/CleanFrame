// Development only: check ES5 grammar and common runtime mistakes.
export default [{
  files: ['app/**/*.js'],
  languageOptions: {
    ecmaVersion: 5,
    sourceType: 'script',
    globals: {
      window: 'readonly', document: 'readonly', Image: 'readonly', localStorage: 'readonly',
      setTimeout: 'readonly', clearTimeout: 'readonly', setInterval: 'readonly', clearInterval: 'readonly', Promise: 'readonly',
      FrameDevice: 'readonly', tizen: 'readonly'
    }
  },
  rules: {
    'no-undef': 'error',
    'no-unused-vars': ['error', { args: 'none', caughtErrors: 'none' }],
    'no-eval': 'error',
    'no-implied-eval': 'error',
    'no-new-func': 'error',
    'no-script-url': 'error',
    'no-unreachable': 'error',
    'no-constant-condition': 'error',
    'no-dupe-args': 'error',
    'no-dupe-keys': 'error',
    'no-duplicate-case': 'error',
    'no-func-assign': 'error',
    'no-global-assign': 'error',
    'no-unexpected-multiline': 'error',
    'valid-typeof': 'error',
    eqeqeq: ['error', 'always']
  }
}];
