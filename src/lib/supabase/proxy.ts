import { createServerClient } from '@supabase/ssr';
import type { NextRequest, NextResponse } from 'next/server';

import type { Database } from '@/lib/database.types';
import { supabasePublicEnv } from '@/lib/supabase/env';

type CookieToSet = { name: string; value: string; options: Parameters<NextResponse['cookies']['set']>[2] };

export type ProxySession = {
  signedIn: boolean;
  /** Copies the refreshed (or cleared) auth cookies and their cache headers onto a response. */
  applyTo: (response: NextResponse) => NextResponse;
};

// Refreshes the Supabase session in the proxy, the only place that can write cookies on every request.
// The refreshed cookies are also written back to `request`, so the page rendered after the proxy reads
// the new session instead of refreshing (and rotating) the token a second time.
export async function refreshSession(request: NextRequest): Promise<ProxySession> {
  const { url, anonKey } = supabasePublicEnv();
  let cookiesToSet: CookieToSet[] = [];
  let headersToSet: Record<string, string> = {};

  const supabase = createServerClient<Database>(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookies, headers) {
        for (const { name, value } of cookies) request.cookies.set(name, value);
        cookiesToSet = cookies;
        headersToSet = headers;
      },
    },
  });

  // getClaims() validates the JWT (refreshing it when expired). Keep it as the first call on the
  // client: anything in between can log the user out at random.
  const { data } = await supabase.auth.getClaims();

  return {
    signedIn: Boolean(data?.claims.sub),
    applyTo(response) {
      for (const { name, value, options } of cookiesToSet) response.cookies.set(name, value, options);
      for (const [key, value] of Object.entries(headersToSet)) response.headers.set(key, value);
      return response;
    },
  };
}
