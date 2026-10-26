import createMiddleware from 'next-intl/middleware';
import { NextResponse, type NextRequest } from 'next/server';
import { routing } from './i18n/routing';
import { currentSeasonYear } from './lib/season';

const handleI18nRouting = createMiddleware(routing);

const LOCALE_ROOT = new RegExp(`^/(${routing.locales.join('|')})/?$`);

// Redirecting here (rather than in the page) yields a real 307 instead of a
// streamed redirect, and `/` goes straight to `/{locale}/{year}` in one hop.
export default function proxy(request: NextRequest) {
  const response = handleI18nRouting(request);

  const location = response.headers.get('location');
  const target = location ? new URL(location, request.url) : request.nextUrl;
  const match = LOCALE_ROOT.exec(target.pathname);
  if (!match) return response;

  const destination = new URL(`/${match[1]}/${currentSeasonYear()}`, request.url);
  destination.search = target.search;
  if (location) {
    response.headers.set('location', destination.toString());
    return response;
  }
  return NextResponse.redirect(destination);
}

export const config = {
  // Skip Next internals, Vercel internals, API routes and files with an extension.
  matcher: ['/((?!api|_next|_vercel|.*\\..*).*)'],
};
