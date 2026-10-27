import { describe, expect, it } from 'vitest';
import { MIN_PASSWORD_LENGTH, validateNewPassword } from './password';

describe('validateNewPassword', () => {
  const ok = 'x'.repeat(MIN_PASSWORD_LENGTH);

  it('accepts a long enough password that matches its confirmation', () => {
    expect(validateNewPassword(ok, ok)).toBeNull();
  });

  it('rejects a password shorter than the minimum, even when confirmed', () => {
    const short = 'x'.repeat(MIN_PASSWORD_LENGTH - 1);
    expect(validateNewPassword(short, short)).toBe('tooShort');
    expect(validateNewPassword('', '')).toBe('tooShort');
  });

  it('rejects a confirmation that differs', () => {
    expect(validateNewPassword(ok, `${ok}!`)).toBe('mismatch');
  });
});
