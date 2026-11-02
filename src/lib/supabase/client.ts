import { createBrowserClient } from '@supabase/ssr';

import type { Database } from '@/lib/database.types';
import { supabasePublicEnv } from '@/lib/supabase/env';

// Supabase client for Client Components. Uses the anon key, so every query goes through RLS.
export function createClient() {
  const { url, anonKey } = supabasePublicEnv();
  return createBrowserClient<Database>(url, anonKey);
}
