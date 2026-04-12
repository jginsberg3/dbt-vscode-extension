import tseslint from 'typescript-eslint';

export default tseslint.config(
    ...tseslint.configs.recommended,
    {
        ignores: ['out/**', 'node_modules/**'],
    },
    {
        rules: {
            // Allow underscore-prefixed parameters required by interface contracts (e.g. VS Code APIs)
            '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
        },
    }
);
