'use server';

import { refresh } from 'next/cache';

import { requireBtc } from '@/lib/auth/session';
import { isUuid, parseNewUser, type NewUserError, validateTempPassword } from '@/lib/auth/users';
import { createAdminClient } from '@/lib/supabase/admin';

// Roughly 100 years: Supabase has no "ban forever", and a banned user can neither sign in nor
// refresh a token.
const BAN_FOREVER = '876000h';

export type CreateUserState =
  { error: NewUserError | 'emailTaken' | 'weak' | 'failed' } | { ok: true; email: string } | undefined;

export type UserActionState = { error: 'tooShort' | 'weak' | 'self' | 'failed' } | { ok: true } | undefined;

export async function createUser(_prev: CreateUserState, formData: FormData): Promise<CreateUserState> {
  await requireBtc();
  const parsed = parseNewUser(formData);
  if (!parsed.ok) return { error: parsed.error };
  const { email, displayName, role, password } = parsed.value;

  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error || !data.user) {
    if (error?.code === 'email_exists' || error?.code === 'user_already_exists') return { error: 'emailTaken' };
    if (error?.code === 'weak_password') return { error: 'weak' };
    return { error: 'failed' };
  }

  const { error: profileError } = await admin.from('profile').insert({
    user_id: data.user.id,
    display_name: displayName,
    role,
    must_change_password: true,
    is_active: true,
  });
  if (profileError) {
    // Without a profile the account is unusable and would block re-creating the email: roll back.
    await admin.auth.admin.deleteUser(data.user.id);
    return { error: 'failed' };
  }

  refresh();
  return { ok: true, email };
}

export async function setUserActive(_prev: UserActionState, formData: FormData): Promise<UserActionState> {
  const staff = await requireBtc();
  const userId = String(formData.get('userId') ?? '');
  const active = formData.get('active') === 'true';
  if (!isUuid(userId)) return { error: 'failed' };
  if (!active && userId === staff.id) return { error: 'self' };

  const admin = createAdminClient();
  const { error } = await admin.from('profile').update({ is_active: active }).eq('user_id', userId);
  if (error) return { error: 'failed' };

  // The ban stops the account at the Supabase level too (sign-in and token refresh).
  const { error: banError } = await admin.auth.admin.updateUserById(userId, {
    ban_duration: active ? 'none' : BAN_FOREVER,
  });
  if (banError) return { error: 'failed' };

  refresh();
  return { ok: true };
}

export async function resetUserPassword(_prev: UserActionState, formData: FormData): Promise<UserActionState> {
  await requireBtc();
  const userId = String(formData.get('userId') ?? '');
  const password = String(formData.get('password') ?? '');
  if (!isUuid(userId)) return { error: 'failed' };
  const invalid = validateTempPassword(password);
  if (invalid) return { error: invalid };

  const admin = createAdminClient();
  const { error } = await admin.auth.admin.updateUserById(userId, { password });
  if (error) return { error: error.code === 'weak_password' ? 'weak' : 'failed' };

  const { error: profileError } = await admin
    .from('profile')
    .update({ must_change_password: true })
    .eq('user_id', userId);
  if (profileError) return { error: 'failed' };

  refresh();
  return { ok: true };
}
