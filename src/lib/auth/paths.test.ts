import { describe, expect, it } from 'vitest';
import { protectedAdminPath, safeNextPath } from './paths';

describe('protectedAdminPath', () => {
  it.each([
    ['/vi/admin', { locale: 'vi', path: '/admin' }],
    ['/en/admin/', { locale: 'en', path: '/admin' }],
    ['/vi/admin/matches/42', { locale: 'vi', path: '/admin/matches/42' }],
    ['/en/admin/change-password', { locale: 'en', path: '/admin/change-password' }],
  ])('protects %s', (pathname, expected) => {
    expect(protectedAdminPath(pathname)).toEqual(expected);
  });

  it.each(['/vi/admin/login', '/en/admin/login/', '/vi/2027', '/vi/administrator', '/fr/admin', '/admin'])(
    'leaves %s alone',
    (pathname) => {
      expect(protectedAdminPath(pathname)).toBeNull();
    },
  );
});

describe('safeNextPath', () => {
  it.each(['/admin', '/admin/matches', '/admin/matches?mine=1', '/admin/seasons/2027/players'])('keeps %s', (next) => {
    expect(safeNextPath(next)).toBe(next);
  });

  it.each([
    undefined,
    null,
    '',
    'https://evil.example.com/admin',
    '//evil.example.com/admin',
    '/administrator',
    '/vi/2027',
    '/admin/login',
    '/admin//evil.example.com',
    '/admin/\\evil.example.com',
  ])('falls back to /admin for %s', (next) => {
    expect(safeNextPath(next)).toBe('/admin');
  });
});
