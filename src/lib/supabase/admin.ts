import 'server-only';

import { createClient } from '@supabase/supabase-js';

import type { Database } from '@/lib/database.types';
import { required, supabasePublicEnv } from '@/lib/supabase/env';

// Service-role client: bypasses RLS and can call the Auth Admin API (create users, reset passwords).
// Server only: the `server-only` import fails the build if a Client Component imports this file,
// so the key never reaches the browser (spec §3.2). Check `role = 'btc'` before using it.
export function createAdminClient() {
  const { url } = supabasePublicEnv();
  const serviceRoleKey = required('SUPABASE_SERVICE_ROLE_KEY', process.env.SUPABASE_SERVICE_ROLE_KEY);

  return createClient<Database>(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
