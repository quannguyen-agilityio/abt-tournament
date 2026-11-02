import 'server-only';

import { getLocale } from 'next-intl/server';
import { connection } from 'next/server';
import { cache } from 'react';

import { redirect } from '@/i18n/navigation';
import type { AdminRole } from '@/lib/admin-nav';
import { ADMIN_HOME, CHANGE_PASSWORD_PATH, LOGIN_PATH } from '@/lib/auth/paths';
import { createClient } from '@/lib/supabase/server';

export type Staff = {
  id: string;
  email: string;
  displayName: string;
  role: AdminRole;
  mustChangePassword: boolean;
};

/**
 * The signed-in BTC member or referee, or `null` when signed out, without a profile or deactivated
 * (`is_active = false`). Cached per request, so a layout and its page share one lookup.
 */
export const getStaff = cache(async (): Promise<Staff | null> => {
  // getClaims() reads the clock to check the token's expiry, which is request-time data under
  // cacheComponents (runtime prefetches can read cookies, so cookies() alone is not enough).
  await connection();
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  const claims = auth?.claims;
  if (!claims?.sub) return null;

  // RLS lets every user read their own profile row (spec §3.2).
  const { data: profile } = await supabase
    .from('profile')
    .select('display_name, role, must_change_password, is_active')
    .eq('user_id', claims.sub)
    .maybeSingle();
  if (!profile?.is_active) return null;

  return {
    id: claims.sub,
    email: claims.email ?? '',
    displayName: profile.display_name,
    role: profile.role,
    mustChangePassword: profile.must_change_password,
  };
});

async function redirectTo(href: string): Promise<never> {
  return redirect({ href, locale: await getLocale() });
}

/** Any signed-in staff member, even one who still has to change a temporary password. */
export async function requireSignedIn(): Promise<Staff> {
  return (await getStaff()) ?? redirectTo(LOGIN_PATH);
}

/**
 * A signed-in BTC member or referee who has set their own password (spec §6). Call it at the top of
 * every admin page and Server Action: layouts are not re-rendered on client navigation, and the
 * proxy only checks that a session exists.
 */
export async function requireStaff(): Promise<Staff> {
  const staff = await requireSignedIn();
  if (staff.mustChangePassword) return redirectTo(CHANGE_PASSWORD_PATH);
  return staff;
}

/** Like `requireStaff()`, for BTC-only pages and actions. Referees are sent to the admin home. */
export async function requireBtc(): Promise<Staff> {
  const staff = await requireStaff();
  if (staff.role !== 'btc') return redirectTo(ADMIN_HOME);
  return staff;
}
