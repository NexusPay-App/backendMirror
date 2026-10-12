import parser from '@typescript-eslint/parser';
export default [
  { ignores: ['dist/**', 'node_modules/**', 'src/scripts/**'] },
  { files: ['**/*.ts'], languageOptions: { parser, parserOptions: { ecmaVersion: 'latest', sourceType: 'module' } }, rules: { 'no-debugger': 'error', 'no-constant-condition': ['error', { checkLoops: false }], 'no-duplicate-case': 'error', 'constructor-super': 'error', 'valid-typeof': 'error' } },
];
