import type { AdminRole } from '../admin-nav';
import { MIN_PASSWORD_LENGTH } from './password';

export type NewUserInput = { email: string; displayName: string; role: AdminRole; password: string };

export type NewUserError = 'email' | 'displayName' | 'role' | 'tooShort';

export const MAX_DISPLAY_NAME_LENGTH = 80;

// Deliberately loose: Supabase does the real validation, this only catches obvious typos.
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function text(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === 'string' ? value : '';
}

/** Validates the "create account" form. The password is the temporary one the BTC hands over. */
export function parseNewUser(
  formData: FormData,
): { ok: true; value: NewUserInput } | { ok: false; error: NewUserError } {
  const email = text(formData, 'email').trim().toLowerCase();
  if (!EMAIL_SHAPE.test(email)) return { ok: false, error: 'email' };

  const displayName = text(formData, 'displayName').trim();
  if (!displayName || displayName.length > MAX_DISPLAY_NAME_LENGTH) return { ok: false, error: 'displayName' };

  const role = text(formData, 'role');
  if (role !== 'btc' && role !== 'referee') return { ok: false, error: 'role' };

  const password = text(formData, 'password');
  if (validateTempPassword(password)) return { ok: false, error: 'tooShort' };

  return { ok: true, value: { email, displayName, role, password } };
}

/** Checks a temporary password (create or reset). There is no confirmation: the BTC reads it out. */
export function validateTempPassword(password: string): 'tooShort' | null {
  return password.length < MIN_PASSWORD_LENGTH ? 'tooShort' : null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID.test(value);
}

export type UserRow = {
  id: string;
  email: string;
  displayName: string;
  role: AdminRole;
  mustChangePassword: boolean;
  isActive: boolean;
};

type AuthUserLike = { id: string; email?: string | null };
type ProfileLike = {
  user_id: string;
  display_name: string;
  role: AdminRole;
  must_change_password: boolean;
  is_active: boolean;
};

/**
 * Joins Auth users with their profiles. Accounts without a profile cannot sign in to the admin, so
 * they are left out. Active users come first, then by display name in the given locale.
 */
export function joinUsers(authUsers: AuthUserLike[], profiles: ProfileLike[], locale: string): UserRow[] {
  const byId = new Map(profiles.map((p) => [p.user_id, p]));
  const rows: UserRow[] = [];
  for (const user of authUsers) {
    const profile = byId.get(user.id);
    if (!profile) continue;
    rows.push({
      id: user.id,
      email: user.email ?? '',
      displayName: profile.display_name,
      role: profile.role,
      mustChangePassword: profile.must_change_password,
      isActive: profile.is_active,
    });
  }
  const collator = new Intl.Collator(locale);
  return rows.sort((a, b) => Number(b.isActive) - Number(a.isActive) || collator.compare(a.displayName, b.displayName));
}
