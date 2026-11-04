import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin();

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  experimental: {
    // Keep dynamic pages in the client router cache for 30 s (default 0), so going back to a tab just
    // visited does not render it on the server again. Admin actions clear it (src/lib/public-cache.ts),
    // and the match-day auto-refresh uses router.refresh(), which skips it.
    staleTimes: { dynamic: 30 },
  },
  turbopack: {
    rules: {
      '*.css': {
        loaders: ['@tailwindcss/turbopack'],
        as: '*.css',
      },
    },
  },
};

export default withNextIntl(nextConfig);
