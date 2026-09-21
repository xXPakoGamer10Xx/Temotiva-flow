import nextCoreWebVitals from 'eslint-config-next/core-web-vitals';
import nextTypescript from 'eslint-config-next/typescript';

/**
 * ESLint 9 con configuración plana. `next lint` desapareció en Next 16, así que
 * se invoca ESLint directamente (`npm run lint`).
 */
const config = [
  { ignores: ['.next/**', 'node_modules/**', 'next-env.d.ts', '.data/**'] },
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
];

export default config;
