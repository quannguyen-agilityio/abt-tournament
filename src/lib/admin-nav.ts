export type AdminRole = 'btc' | 'referee';

export type AdminNavKey = 'season' | 'players' | 'teams' | 'schedule' | 'matches' | 'closeGroup' | 'awards' | 'users';

export type AdminNavEntry = {
  key: AdminNavKey;
  /** Locale-less path under /admin for the given season year. */
  href: (year: number) => string;
  roles: AdminRole[];
};

const BTC: AdminRole[] = ['btc'];

export const ADMIN_NAV: AdminNavEntry[] = [
  { key: 'season', href: () => '/admin/seasons', roles: BTC },
  { key: 'players', href: (year) => `/admin/seasons/${year}/players`, roles: BTC },
  { key: 'teams', href: (year) => `/admin/seasons/${year}/teams`, roles: BTC },
  { key: 'schedule', href: (year) => `/admin/seasons/${year}/schedule`, roles: BTC },
  { key: 'matches', href: () => '/admin/matches', roles: ['btc', 'referee'] },
  { key: 'closeGroup', href: (year) => `/admin/seasons/${year}/close-group`, roles: BTC },
  { key: 'awards', href: (year) => `/admin/seasons/${year}/awards`, roles: BTC },
  { key: 'users', href: () => '/admin/users', roles: BTC },
];

/** Entries a role may see; others are left out entirely, not disabled. */
export function adminNavFor(role: AdminRole): AdminNavEntry[] {
  return ADMIN_NAV.filter((entry) => entry.roles.includes(role));
}
