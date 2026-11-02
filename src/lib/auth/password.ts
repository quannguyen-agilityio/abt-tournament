/** Stricter than Supabase's own minimum (6, `supabase/config.toml`), which only guards the API. */
export const MIN_PASSWORD_LENGTH = 8;

export type NewPasswordError = 'tooShort' | 'mismatch';

/** Checks a new password and its confirmation before it is sent to Supabase. */
export function validateNewPassword(password: string, confirm: string): NewPasswordError | null {
  if (password.length < MIN_PASSWORD_LENGTH) return 'tooShort';
  if (password !== confirm) return 'mismatch';
  return null;
}
