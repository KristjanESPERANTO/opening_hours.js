import { defineConfig, globalIgnores } from 'eslint/config'
import globals from 'globals'
import js from '@eslint/js'
import markdown from '@eslint/markdown'
import tseslint from 'typescript-eslint'

export default defineConfig([
  globalIgnores(['build/*', 'submodules/*', '**/yohours_model.js']),
  {
    files: ['**/*.js', '**/*.mjs'],
    extends: [js.configs.recommended],
    languageOptions: {
      ecmaVersion: 'latest',
      globals: {
        ...globals.browser,
        ...globals.node,
      },
      sourceType: 'module',
    },
    rules: {
      'no-cond-assign': 'warn',
      'no-constant-binary-expression': 'warn',
      'no-empty': 'warn',
      'no-empty-function': 'warn',
      'no-func-assign': 'warn',
      'no-prototype-builtins': 'warn',
      'no-redeclare': 'warn',
      'no-undef': 'warn',
      'no-unused-vars': 'warn',
    },
  },
  { files: ['**/*.md'], plugins: { markdown }, language: 'markdown/gfm', extends: ['markdown/recommended'] },
  {
    files: ['**/*.ts'],
    extends: [tseslint.configs.recommended],
    rules: {
      '@typescript-eslint/array-type': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
    },
  },
])
