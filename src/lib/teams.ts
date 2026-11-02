// Teams of a season (spec §6, A3): form validation, default colors and roster warnings.

export const MAX_TEAM_NAME_LENGTH = 40;

/** Default colors for new teams, in order. Distinct hues that read on both themes. */
export const TEAM_COLORS = [
  '#2563eb',
  '#dc2626',
  '#16a34a',
  '#d97706',
  '#7c3aed',
  '#0891b2',
  '#db2777',
  '#65a30d',
  '#ea580c',
  '#475569',
] as const;

const COLOR = /^#[0-9a-f]{6}$/i;

/** The first palette color not in `used`; once all are taken, the palette starts over. */
export function nextTeamColors(used: string[], count: number): string[] {
  const taken = new Set(used.map((c) => c.toLowerCase()));
  const free = TEAM_COLORS.filter((c) => !taken.has(c));
  return Array.from({ length: count }, (_, i) =>
    i < free.length ? free[i] : TEAM_COLORS[(i - free.length) % TEAM_COLORS.length],
  );
}

export type TeamFormError = 'name' | 'color';

/** Validates the create / edit team form. Collects every error, not just the first. */
export function parseTeamForm(
  formData: FormData,
): { ok: true; value: { name: string; color: string } } | { ok: false; errors: TeamFormError[] } {
  const errors: TeamFormError[] = [];
  const rawName = formData.get('name');
  const name = typeof rawName === 'string' ? rawName.trim().replace(/\s+/g, ' ') : '';
  if (!name || name.length > MAX_TEAM_NAME_LENGTH) errors.push('name');
  const rawColor = formData.get('color');
  const color = typeof rawColor === 'string' ? rawColor.trim().toLowerCase() : '';
  if (!COLOR.test(color)) errors.push('color');
  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, value: { name, color } };
}

export type RosterPlayer = {
  id: string;
  fullName: string;
  rank: number;
  skillPoints: number;
  status: 'active' | 'withdrawn';
};

/** Strongest first: rank, then skill points (high first), then name. Returns a new array. */
export function sortRoster<T extends Omit<RosterPlayer, 'id'>>(players: T[]): T[] {
  return [...players].sort(
    (a, b) => a.rank - b.rank || b.skillPoints - a.skillPoints || a.fullName.localeCompare(b.fullName, 'vi'),
  );
}

export type TeamWarnings = {
  /** Ranks 1..maxRank with no active player, per team id. Teams with none are left out. */
  missingRanks: Record<string, number[]>;
  /** Active roster size per team id, set only when the sizes differ. */
  sizes: Record<string, number> | null;
  /** Active players of the season without a team. */
  unassigned: number;
};

/** Warnings shown above the teams (spec §6 A3). Withdrawn players do not count. */
export function teamWarnings(
  teams: { id: string; players: Pick<RosterPlayer, 'rank' | 'status'>[] }[],
  unassigned: Pick<RosterPlayer, 'status'>[],
  { maxRank }: { maxRank: number },
): TeamWarnings {
  const missingRanks: Record<string, number[]> = {};
  const sizes: Record<string, number> = {};
  for (const team of teams) {
    const active = team.players.filter((p) => p.status === 'active');
    sizes[team.id] = active.length;
    const ranks = new Set(active.map((p) => p.rank));
    const missing = Array.from({ length: maxRank }, (_, i) => i + 1).filter((rank) => !ranks.has(rank));
    if (missing.length > 0) missingRanks[team.id] = missing;
  }
  const differ = new Set(Object.values(sizes)).size > 1;
  return {
    missingRanks,
    sizes: differ ? sizes : null,
    unassigned: unassigned.filter((p) => p.status === 'active').length,
  };
}
