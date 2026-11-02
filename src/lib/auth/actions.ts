'use server';

import { getLocale } from 'next-intl/server';

import { redirect } from '@/i18n/navigation';
import { LOGIN_PATH } from '@/lib/auth/paths';
import { createClient } from '@/lib/supabase/server';

export async function signOut(): Promise<never> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  return redirect({ href: LOGIN_PATH, locale: await getLocale() });
}
