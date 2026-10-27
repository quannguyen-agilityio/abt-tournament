import { describe, expect, it } from 'vitest';
import { MIN_PASSWORD_LENGTH } from './password';
import { isUuid, joinUsers, parseNewUser, validateTempPassword } from './users';

const password = 'x'.repeat(MIN_PASSWORD_LENGTH);

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

const valid = { email: 'ref@example.com', displayName: 'Ref Eree', role: 'referee', password };

describe('parseNewUser', () => {
  it('accepts a complete form', () => {
    expect(parseNewUser(form(valid))).toEqual({ ok: true, value: valid });
  });

  it('trims and lowercases the email and trims the display name', () => {
    const result = parseNewUser(form({ ...valid, email: '  Ref@Example.COM ', displayName: '  Ref Eree  ' }));
    expect(result).toEqual({ ok: true, value: valid });
  });

  it('keeps the password as typed', () => {
    const spaced = ` ${password} `;
    expect(parseNewUser(form({ ...valid, password: spaced }))).toMatchObject({ ok: true, value: { password: spaced } });
  });

  it('rejects a malformed or missing email', () => {
    for (const email of ['', 'ref', 'ref@', 'ref@example', 'a b@example.com']) {
      expect(parseNewUser(form({ ...valid, email }))).toEqual({ ok: false, error: 'email' });
    }
    expect(parseNewUser(form({ displayName: 'Ref Eree', role: 'referee', password }))).toEqual({
      ok: false,
      error: 'email',
    });
  });

  it('rejects an empty or overlong display name', () => {
    expect(parseNewUser(form({ ...valid, displayName: '   ' }))).toEqual({ ok: false, error: 'displayName' });
    expect(parseNewUser(form({ ...valid, displayName: 'n'.repeat(81) }))).toEqual({ ok: false, error: 'displayName' });
  });

  it('rejects an unknown role', () => {
    expect(parseNewUser(form({ ...valid, role: 'admin' }))).toEqual({ ok: false, error: 'role' });
    expect(parseNewUser(form({ ...valid, role: '' }))).toEqual({ ok: false, error: 'role' });
  });

  it('rejects a short password', () => {
    const short = 'x'.repeat(MIN_PASSWORD_LENGTH - 1);
    expect(parseNewUser(form({ ...valid, password: short }))).toEqual({ ok: false, error: 'tooShort' });
  });

  it('accepts the btc role', () => {
    expect(parseNewUser(form({ ...valid, role: 'btc' }))).toMatchObject({ ok: true, value: { role: 'btc' } });
  });
});

describe('validateTempPassword', () => {
  it('requires the minimum length', () => {
    expect(validateTempPassword(password)).toBeNull();
    expect(validateTempPassword(password.slice(1))).toBe('tooShort');
  });
});

describe('isUuid', () => {
  it('recognises UUIDs only', () => {
    expect(isUuid('3f2b8c1e-5a4d-4e6f-9b0a-1c2d3e4f5a6b')).toBe(true);
    expect(isUuid('nope')).toBe(false);
    expect(isUuid('')).toBe(false);
  });
});

describe('joinUsers', () => {
  const profile = (user_id: string, display_name: string, is_active = true) => ({
    user_id,
    display_name,
    role: 'referee' as const,
    must_change_password: false,
    is_active,
  });

  it('drops users without a profile and maps the fields', () => {
    const rows = joinUsers(
      [
        { id: 'a', email: 'a@x.com' },
        { id: 'b', email: 'b@x.com' },
      ],
      [profile('a', 'Ann')],
      'en',
    );
    expect(rows).toEqual([
      { id: 'a', email: 'a@x.com', displayName: 'Ann', role: 'referee', mustChangePassword: false, isActive: true },
    ]);
  });

  it('lists active users first, then sorts by display name for the locale', () => {
    const users = ['a', 'b', 'c', 'd'].map((id) => ({ id, email: `${id}@x.com` }));
    const rows = joinUsers(
      users,
      [profile('a', 'Zoe'), profile('b', 'Ân'), profile('c', 'An', false), profile('d', 'Bình')],
      'vi',
    );
    expect(rows.map((r) => r.displayName)).toEqual(['Ân', 'Bình', 'Zoe', 'An']);
  });
});
