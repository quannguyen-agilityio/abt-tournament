import 'server-only';

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

import type { Database } from '@/lib/database.types';
import { supabasePublicEnv } from '@/lib/supabase/env';

// Supabase client for Server Components, Server Actions and Route Handlers. It acts as the signed-in
// user (session read from cookies) with the anon key, so every query goes through RLS.
export async function createClient() {
  const { url, anonKey } = supabasePublicEnv();
  const cookieStore = await cookies();

  return createServerClient<Database>(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Server Components cannot set cookies. Safe to ignore as long as the session is refreshed
          // elsewhere (Server Action, Route Handler or proxy).
        }
      },
    },
  });
}
