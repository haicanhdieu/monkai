import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  { ignores: ['dist'] },
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
      'react-refresh/only-export-components': [
        'warn',
        { allowConstantExport: true },
      ],
      'no-restricted-globals': [
        'error',
        { name: 'localStorage', message: 'Use StorageService instead of localStorage directly.' },
        { name: 'indexedDB', message: 'Use StorageService instead of indexedDB directly.' }
      ],
      'no-restricted-imports': [
        'error',
        {
          patterns: [{ group: ['localforage'], message: 'Import StorageService from @/shared/services/storage.service instead.' }]
        }
      ]
    },
  },
)
