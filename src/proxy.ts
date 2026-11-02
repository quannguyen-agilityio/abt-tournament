import { createClient } from '@supabase/supabase-js';
import createMiddleware from 'next-intl/middleware';
import { NextResponse, type NextRequest } from 'next/server';
import { routing } from './i18n/routing';
import { LOGIN_PATH, protectedAdminPath } from './lib/auth/paths';
import type { Database } from './lib/database.types';
import { currentSeasonYear } from './lib/season';
import { supabasePublicEnv } from './lib/supabase/env';
import { refreshSession } from './lib/supabase/proxy';

const handleI18nRouting = createMiddleware(routing);

const LOCALE_ROOT = new RegExp(`^/(${routing.locales.join('|')})/?$`);

export default async function proxy(request: NextRequest) {
  // Only admin pages read the session, so public pages skip the Supabase round trip. This is an
  // optimistic check on the JWT alone; pages and actions re-check the profile (src/lib/auth/session.ts).
  const admin = protectedAdminPath(request.nextUrl.pathname);
  if (admin) {
    const session = await refreshSession(request);
    if (!session.signedIn) {
      const login = new URL(`/${admin.locale}${LOGIN_PATH}`, request.url);
      login.searchParams.set('next', admin.path + request.nextUrl.search);
      return session.applyTo(NextResponse.redirect(login));
    }
    // Runs after the refresh, so the request headers next-intl forwards carry the new cookies.
    return session.applyTo(handleI18nRouting(request));
  }

  return await withSeasonRedirect(request, handleI18nRouting(request));
}

// Year of the season marked current. Anonymous and cookie-less: the current season is never a draft,
// so RLS lets anon read it. Any failure falls back to the calendar year, so `/` works without the DB.
async function currentYear(): Promise<number> {
  try {
    const { url, anonKey } = supabasePublicEnv();
    const supabase = createClient<Database>(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await supabase.from('season').select('year').eq('is_current', true).maybeSingle();
    if (!error && data) return data.year;
  } catch {
    // Fall through to the calendar year.
  }
  return currentSeasonYear();
}

// Redirecting here (rather than in the page) yields a real 307 instead of a
// streamed redirect, and `/` goes straight to `/{locale}/{year}` in one hop.
async function withSeasonRedirect(request: NextRequest, response: NextResponse) {
  const location = response.headers.get('location');
  const target = location ? new URL(location, request.url) : request.nextUrl;
  const match = LOCALE_ROOT.exec(target.pathname);
  if (!match) return response;

  const destination = new URL(`/${match[1]}/${await currentYear()}`, request.url);
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
