'use server';

import { getLocale } from 'next-intl/server';

import { redirect } from '@/i18n/navigation';
import { CHANGE_PASSWORD_PATH, safeNextPath } from '@/lib/auth/paths';
import { createClient } from '@/lib/supabase/server';

export type SignInState = { error: 'missing' | 'invalid' | 'inactive' | 'failed'; email: string } | undefined;

export async function signIn(_prev: SignInState, formData: FormData): Promise<SignInState> {
  const email = String(formData.get('email') ?? '').trim();
  const password = String(formData.get('password') ?? '');
  if (!email || !password) return { error: 'missing', email };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: error.code === 'invalid_credentials' ? 'invalid' : 'failed', email };

  // Accounts are created by the BTC with a profile (spec §6 A8); one without a profile, or a
  // deactivated one, must not keep a session.
  const { data: profile } = await supabase
    .from('profile')
    .select('is_active, must_change_password')
    .eq('user_id', data.user.id)
    .maybeSingle();
  if (!profile?.is_active) {
    await supabase.auth.signOut();
    return { error: 'inactive', email };
  }

  const href = profile.must_change_password ? CHANGE_PASSWORD_PATH : safeNextPath(formData.get('next'));
  return redirect({ href, locale: await getLocale() });
}
