'use server';

import { getLocale } from 'next-intl/server';

import { redirect } from '@/i18n/navigation';
import { ADMIN_HOME } from '@/lib/auth/paths';
import { type NewPasswordError, validateNewPassword } from '@/lib/auth/password';
import { requireSignedIn } from '@/lib/auth/session';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

export type ChangePasswordState = { error: NewPasswordError | 'samePassword' | 'weak' | 'failed' } | undefined;

export async function changePassword(_prev: ChangePasswordState, formData: FormData): Promise<ChangePasswordState> {
  const staff = await requireSignedIn();
  const password = String(formData.get('password') ?? '');
  const invalid = validateNewPassword(password, String(formData.get('confirm') ?? ''));
  if (invalid) return { error: invalid };

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    if (error.code === 'same_password') return { error: 'samePassword' };
    if (error.code === 'weak_password') return { error: 'weak' };
    return { error: 'failed' };
  }

  // Users may only read their own profile (RLS), so the flag is cleared with the service role. It is
  // scoped to the signed-in user and runs only after Supabase accepted the new password.
  const { error: profileError } = await createAdminClient()
    .from('profile')
    .update({ must_change_password: false })
    .eq('user_id', staff.id);
  if (profileError) return { error: 'failed' };

  return redirect({ href: ADMIN_HOME, locale: await getLocale() });
}
