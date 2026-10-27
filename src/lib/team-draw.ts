// Draw CSV import (spec §6 A3, plan D7): the draw happens outside the app and arrives as
// `full_name, team_name`. Pure on purpose: the server action recomputes the plan from the database on
// every preview and apply.
import { normalizeName, parseCsv, slugify } from './player-import';
import { MAX_TEAM_NAME_LENGTH, nextTeamColors } from './teams';

export const MAX_DRAW_ROWS = 500;
/** Upper bound for the CSV text accepted by the server actions. */
export const MAX_DRAW_BYTES = 100 * 1024;

export const DRAW_COLUMNS = ['full_name', 'team_name'] as const;

export type DrawRowError = 'fullName' | 'teamName' | 'unknownPlayer' | 'ambiguousPlayer' | 'duplicate';

export type DrawRow = { line: number; fullName: string; teamName: string };

export type DrawParseResult = { ok: false; error: 'empty' | 'header' | 'tooMany' } | { ok: true; rows: DrawRow[] };

export function parseDrawCsv(text: string): DrawParseResult {
  const records = parseCsv(text);
  if (records.length === 0) return { ok: false, error: 'empty' };

  const header = records[0].cells.map((c) => c.trim().toLowerCase());
  const index = new Map<string, number>();
  header.forEach((name, i) => {
    if (!index.has(name)) index.set(name, i);
  });
  if (!DRAW_COLUMNS.every((c) => index.has(c))) return { ok: false, error: 'header' };

  const dataRecords = records.slice(1);
  if (dataRecords.length > MAX_DRAW_ROWS) return { ok: false, error: 'tooMany' };

  const cell = (cells: string[], column: (typeof DRAW_COLUMNS)[number]) =>
    (cells[index.get(column) as number] ?? '').trim().replace(/\s+/g, ' ');
  return {
    ok: true,
    rows: dataRecords.map((r) => ({
      line: r.line,
      fullName: cell(r.cells, 'full_name'),
      teamName: cell(r.cells, 'team_name'),
    })),
  };
}

export type DrawPlayer = { id: string; fullName: string; slug: string; teamId: string | null };
export type DrawTeam = { id: string; name: string; color: string };

/** One write for `import_team_draw`. A null `team_id` means the new team named `team_name`. */
export type DrawAssignment = { season_player_id: string; team_id: string | null; team_name: string };
export type NewTeam = { name: string; color: string };

export type DrawPlanRow =
  | { line: number; kind: 'invalid'; name: string; teamName: string; errors: DrawRowError[] }
  | { line: number; kind: 'assign'; name: string; teamName: string; fromTeam: string | null; newTeam: boolean }
  | { line: number; kind: 'unchanged'; name: string; teamName: string };

export type DrawPlanKind = DrawPlanRow['kind'];

export type DrawPlan = {
  rows: DrawPlanRow[];
  counts: Record<DrawPlanKind, number>;
  newTeams: NewTeam[];
  assignments: DrawAssignment[];
  canApply: boolean;
};

/**
 * Matches each row to a season player (by slug, exact name, then name without diacritics) and to a
 * team (by name, ignoring case and spacing). Team names the season does not have yet become new
 * teams with default colors. Players the file does not list keep their team.
 */
export function planDrawImport({
  rows,
  players,
  teams,
}: {
  rows: DrawRow[];
  players: DrawPlayer[];
  teams: DrawTeam[];
}): DrawPlan {
  const teamByName = new Map<string, DrawTeam>();
  for (const team of teams)
    if (!teamByName.has(normalizeName(team.name))) teamByName.set(normalizeName(team.name), team);
  const teamById = new Map(teams.map((t) => [t.id, t]));

  const findPlayers = (name: string): DrawPlayer[] => {
    const bySlug = players.filter((p) => p.slug === name);
    if (bySlug.length > 0) return bySlug;
    const byName = players.filter((p) => normalizeName(p.fullName) === normalizeName(name));
    if (byName.length > 0) return byName;
    const slug = slugify(name);
    return players.filter((p) => slugify(p.fullName) === slug);
  };

  const newNames = new Map<string, string>();
  const seen = new Set<string>();
  const out: DrawPlanRow[] = [];
  const pending: { playerId: string; teamKey: string }[] = [];

  for (const row of rows) {
    const errors: DrawRowError[] = [];
    if (!row.fullName) errors.push('fullName');
    if (!row.teamName || row.teamName.length > MAX_TEAM_NAME_LENGTH) errors.push('teamName');
    const matches = row.fullName ? findPlayers(row.fullName) : [];
    if (row.fullName && matches.length === 0) errors.push('unknownPlayer');
    if (matches.length > 1) errors.push('ambiguousPlayer');
    if (matches.length === 1 && seen.has(matches[0].id)) errors.push('duplicate');
    if (errors.length > 0) {
      out.push({ line: row.line, kind: 'invalid', name: row.fullName, teamName: row.teamName, errors });
      continue;
    }

    const player = matches[0];
    seen.add(player.id);
    const teamKey = normalizeName(row.teamName);
    const existing = teamByName.get(teamKey);
    if (!existing && !newNames.has(teamKey)) newNames.set(teamKey, row.teamName);
    const teamName = existing?.name ?? (newNames.get(teamKey) as string);

    if (existing && player.teamId === existing.id) {
      out.push({ line: row.line, kind: 'unchanged', name: player.fullName, teamName });
      continue;
    }
    const fromTeam = player.teamId ? (teamById.get(player.teamId)?.name ?? null) : null;
    out.push({ line: row.line, kind: 'assign', name: player.fullName, teamName, fromTeam, newTeam: !existing });
    pending.push({ playerId: player.id, teamKey });
  }

  const colors = nextTeamColors(
    teams.map((t) => t.color),
    newNames.size,
  );
  const newTeams = [...newNames.values()].map((name, i) => ({ name, color: colors[i] }));
  const assignments = pending.map(({ playerId, teamKey }): DrawAssignment => {
    const existing = teamByName.get(teamKey);
    return existing
      ? { season_player_id: playerId, team_id: existing.id, team_name: existing.name }
      : { season_player_id: playerId, team_id: null, team_name: newNames.get(teamKey) as string };
  });

  const counts: Record<DrawPlanKind, number> = { assign: 0, unchanged: 0, invalid: 0 };
  for (const r of out) counts[r.kind] += 1;
  return { rows: out, counts, newTeams, assignments, canApply: assignments.length > 0 };
}
