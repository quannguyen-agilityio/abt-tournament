import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';
import prettier from 'eslint-config-prettier/flat';

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    '.next/**',
    'out/**',
    'build/**',
    'next-env.d.ts',
    // Not application code.
    'docs/**',
    '.claude/**',
    'supabase/**',
  ]),
  {
    // Keep the domain layer pure: no framework, UI or database imports.
    files: ['src/domain/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                'next',
                'next/*',
                'react',
                'react/*',
                'react-dom',
                'react-dom/*',
                '@supabase/*',
                '@/app/*',
                '@/components/*',
              ],
              message: 'src/domain must stay framework-free: no next, react or @supabase imports.',
            },
          ],
        },
      ],
    },
  },
  prettier,
]);

export default eslintConfig;
