import { describe, expect, it } from 'vitest';
import { ADMIN_NAV, adminNavFor } from './admin-nav';

describe('adminNavFor', () => {
  it('gives btc every entry', () => {
    expect(adminNavFor('btc').map((e) => e.key)).toEqual([
      'season',
      'players',
      'teams',
      'schedule',
      'matches',
      'closeGroup',
      'awards',
      'users',
    ]);
  });

  it('gives referees only the matches entry', () => {
    expect(adminNavFor('referee').map((e) => e.key)).toEqual(['matches']);
  });

  it('builds season-scoped paths from the year', () => {
    const hrefs = Object.fromEntries(ADMIN_NAV.map((e) => [e.key, e.href(2026)]));
    expect(hrefs.season).toBe('/admin/seasons');
    expect(hrefs.players).toBe('/admin/seasons/2026/players');
    expect(hrefs.closeGroup).toBe('/admin/seasons/2026/close-group');
    expect(hrefs.matches).toBe('/admin/matches');
    expect(hrefs.users).toBe('/admin/users');
  });
});
