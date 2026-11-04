import 'server-only';

import { createClient } from '@supabase/supabase-js';

import type { Database } from '@/lib/database.types';
import { supabasePublicEnv } from '@/lib/supabase/env';

// Cookie-less client for the cached public reads ('use cache' scopes cannot read cookies). It always
// reads as anon, so RLS returns what the public may see: no draft seasons, no lineups before the lock.
export function createPublicClient() {
  const { url, anonKey } = supabasePublicEnv();
  return createClient<Database>(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
