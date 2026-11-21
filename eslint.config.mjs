import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FlatCompat } from '@eslint/eslintrc';

const compat = new FlatCompat({ baseDirectory: dirname(fileURLToPath(import.meta.url)) });

/** Local SVG and public assets are served as plain <img> on purpose (no remote image CDN). */
const eslintConfig = [
  {
    ignores: [
      '.next/**',
      'node_modules/**',
      'web/dist/**',
      'out/**',
      'bounties/**/node_modules/**',
      'bounties/**/dist/**',
    ],
  },
  ...compat.extends('next/core-web-vitals'),
  {
    linterOptions: { reportUnusedDisableDirectives: 'off' },
    rules: {
      '@next/next/no-img-element': 'off',
    },
  },
];

export default eslintConfig;
