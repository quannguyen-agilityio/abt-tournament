// Writes the import model to the database (spec §9). Everything is matched by natural keys and only
// differences are written, so a re-run does nothing (and the audit log stays quiet).
import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Json, Tables } from '../../../src/lib/database.types';
import { DEFAULT_SEASON_SETTINGS } from '../../../src/domain/settings';
import type { Import2026 } from './model';
import { nameKey } from './names';
import { computeGroupStandings } from './verify';

type Client = SupabaseClient<Database>;
type TableName = keyof Database['public']['Tables'];

export const SEASON_YEAR = 2026;

export interface Change {
  table: string;
  action: 'insert' | 'update';
  /** Natural key, for the log. */
  key: string;
  /** Columns that changed (updates only). */
  fields: string[];
}

export interface SyncResult {
  changes: Change[];
  warnings: string[];
}

interface Ctx {
  client: Client;
  dryRun: boolean;
  changes: Change[];
  warnings: string[];
}

/** A Supabase result with its error checked. */
function ok<T>(res: { data: T | null; error: { message: string } | null }, what: string): T {
  if (res.error) throw new Error(`${what}: ${res.error.message}`);
  return (res.data ?? []) as T;
}

async function write(ctx: Ctx, what: string, op: () => PromiseLike<{ error: { message: string } | null }>) {
  if (ctx.dryRun) return;
  const { error } = await op();
  if (error) throw new Error(`${what}: ${error.message}`);
}

const ISO = /^\d{4}-\d{2}-\d{2}T/;

/** Deep equality; timestamps compare as instants. */
function same(a: unknown, b: unknown): boolean {
  if (typeof a === 'string' && typeof b === 'string' && ISO.test(a) && ISO.test(b)) {
    return new Date(a).getTime() === new Date(b).getTime();
  }
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((x, i) => same(x, b[i]));
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    const [ka, kb] = [Object.keys(a), Object.keys(b)];
    return ka.length === kb.length && ka.every((k) => same((a as never)[k], (b as never)[k]));
  }
  return a === b;
}

interface Wanted {
  key: string;
  /** Columns that make the row: inserted as they are, compared on later runs. */
  compare: Record<string, unknown>;
  /** Further columns, set on insert only. */
  insertOnly?: Record<string, unknown>;
}

/**
 * Inserts the wanted rows that are missing and updates the existing ones whose compared columns
 * differ. Returns the id of every wanted key (a fresh id for inserts, also in a dry run).
 */
async function syncRows(
  ctx: Ctx,
  table: TableName,
  existing: readonly { id: string }[],
  keyOf: (row: never) => string,
  wanted: readonly Wanted[],
  fixed: Record<string, unknown> = {},
): Promise<Map<string, string>> {
  const byKey = new Map((existing as never[]).map((r) => [keyOf(r), r as Record<string, unknown>]));
  const ids = new Map<string, string>();
  const inserts: Record<string, unknown>[] = [];
  for (const w of wanted) {
    const row = byKey.get(w.key);
    if (!row) {
      const id = randomUUID();
      ids.set(w.key, id);
      inserts.push({ id, ...fixed, ...w.compare, ...w.insertOnly });
      ctx.changes.push({ table, action: 'insert', key: w.key, fields: [] });
      continue;
    }
    ids.set(w.key, row.id as string);
    const patch = Object.fromEntries(Object.entries(w.compare).filter(([col, value]) => !same(row[col], value)));
    if (Object.keys(patch).length === 0) continue;
    ctx.changes.push({ table, action: 'update', key: w.key, fields: Object.keys(patch) });
    await write(ctx, `update ${table}`, () =>
      ctx.client
        .from(table)
        .update(patch as never)
        .eq('id' as never, row.id as never),
    );
  }
  if (inserts.length > 0) await write(ctx, `insert ${table}`, () => ctx.client.from(table).insert(inserts as never));
  return ids;
}

/** Profiles by display name without spaces, to map the referee labels of the sheet. */
function refereeMap(profiles: readonly { user_id: string; display_name: string }[]) {
  const map = new Map<string, string[]>();
  for (const p of profiles) {
    const key = nameKey(p.display_name).replace(/\s+/g, '');
    map.set(key, [...(map.get(key) ?? []), p.user_id]);
  }
  return map;
}

/** Upserts the 2026 season. Returns what changed and what needs a person's attention. */
export async function syncImport(client: Client, data: Import2026, opts: { dryRun: boolean }): Promise<SyncResult> {
  const ctx: Ctx = { client, dryRun: opts.dryRun, changes: [], warnings: [] };
  const teamNo = new Map<number, string>();
  const bySlug = new Map<string, string>();

  // season: is_current and venue are never touched on an existing season.
  const seasons = ok(await client.from('season').select('*').eq('year', SEASON_YEAR), 'read season');
  const seasonIds = await syncRows(ctx, 'season', seasons, (r: Tables<'season'>) => String(r.year), [
    {
      key: String(SEASON_YEAR),
      compare: {
        name: 'ABT 2026',
        status: 'finished',
        settings: DEFAULT_SEASON_SETTINGS as unknown as Json,
        match_days: data.matchDays,
      },
      insertOnly: { year: SEASON_YEAR, venue: '', is_current: false },
    },
  ]);
  const seasonId = seasonIds.get(String(SEASON_YEAR))!;
  const fixed = { season_id: seasonId };

  // court, team (color and captain are set on insert only).
  const courts = ok(await client.from('court').select('*').eq('season_id', seasonId), 'read court');
  const courtIds = await syncRows(
    ctx,
    'court',
    courts,
    (r: Tables<'court'>) => r.name,
    data.courts.map((c) => ({ key: c.name, compare: { sort_order: c.sort_order }, insertOnly: { name: c.name } })),
    fixed,
  );
  const teams = ok(await client.from('team').select('*').eq('season_id', seasonId), 'read team');
  const teamIds = await syncRows(
    ctx,
    'team',
    teams,
    (r: Tables<'team'>) => r.name,
    data.teams.map((t) => ({ key: t.name, compare: {}, insertOnly: { name: t.name, color: t.color } })),
    fixed,
  );
  for (const t of data.teams) teamNo.set(t.number, teamIds.get(t.name)!);

  // person, season_player, season_player_private.
  const slugs = data.players.map((p) => p.slug);
  const persons = ok(await client.from('person').select('*').in('slug', slugs), 'read person');
  const personIds = await syncRows(
    ctx,
    'person',
    persons,
    (r: Tables<'person'>) => r.slug,
    data.players.map((p) => ({
      key: p.slug,
      compare: { full_name: p.name, gender: p.gender },
      insertOnly: { slug: p.slug },
    })),
  );
  const seasonPlayers = ok(
    await client.from('season_player').select('*').eq('season_id', seasonId),
    'read season_player',
  );
  const personOf = new Map(data.players.map((p) => [personIds.get(p.slug)!, p]));
  const playerIds = await syncRows(
    ctx,
    'season_player',
    seasonPlayers,
    (r: Tables<'season_player'>) => r.person_id,
    data.players.map((p) => ({
      key: personIds.get(p.slug)!,
      compare: { team_id: teamNo.get(p.teamNumber)!, rank: p.rank, skill_points: p.skill },
      insertOnly: { person_id: personIds.get(p.slug)! },
    })),
    fixed,
  );
  for (const [personId, p] of personOf) bySlug.set(p.slug, playerIds.get(personId)!);
  const privates = ok(
    await client
      .from('season_player_private')
      .select('*')
      .in('season_player_id', [...bySlug.values()]),
    'read season_player_private',
  );
  await syncRows(
    ctx,
    'season_player_private',
    privates,
    (r: Tables<'season_player_private'>) => r.season_player_id,
    data.players.map((p) => ({
      key: bySlug.get(p.slug)!,
      compare: { fee_amount: p.fee },
      insertOnly: { season_player_id: bySlug.get(p.slug)!, member_type: 'employee', note: '' },
    })),
  );

  // Captains: the team's Rank 1 player, for teams without one.
  for (const t of data.teams) {
    const existing = teams.find((x) => x.name === t.name);
    const captain = data.players.filter((p) => p.teamNumber === t.number).sort((a, b) => a.rank - b.rank)[0];
    if (!captain || existing?.captain_id) continue;
    const id = teamNo.get(t.number)!;
    if (existing) ctx.changes.push({ table: 'team', action: 'update', key: t.name, fields: ['captain_id'] });
    await write(ctx, 'set captain', () =>
      client
        .from('team')
        .update({ captain_id: bySlug.get(captain.slug)! })
        .eq('id', id),
    );
  }

  // match: referee labels map to profiles by display name.
  const profiles = ok(await client.from('profile').select('user_id, display_name'), 'read profile');
  const referees = refereeMap(profiles);
  const refereeOf = (label: string | null): string | null => {
    if (!label) return null;
    const found = referees.get(nameKey(label).replace(/\s+/g, ''));
    if (found?.length === 1) return found[0];
    const why = found ? 'several profiles match' : 'no profile matches';
    const warning = `Referee "${label}": ${why}; the matches keep the referee they have`;
    if (!ctx.warnings.includes(warning)) ctx.warnings.push(warning);
    return null;
  };
  const matches = ok(await client.from('match').select('*').eq('season_id', seasonId), 'read match');
  const existingMatches = new Map(matches.map((m) => [m.code, m]));
  const matchIds = await syncRows(
    ctx,
    'match',
    matches,
    (r: Tables<'match'>) => r.code,
    data.matches.map((m) => {
      const referee = refereeOf(m.refereeName);
      return {
        key: m.code,
        compare: {
          stage: m.stage,
          round: m.round,
          home_team_id: teamNo.get(m.homeTeam)!,
          away_team_id: teamNo.get(m.awayTeam)!,
          scheduled_at: m.scheduledAt,
          court_id: courtIds.get(`Sân ${m.court}`)!,
          // A referee that cannot be mapped never clears one set by hand.
          referee_id: referee ?? existingMatches.get(m.code)?.referee_id ?? null,
          status: 'completed',
          winner_team_id: teamNo.get(m.winner === 'home' ? m.homeTeam : m.awayTeam)!,
          imported: true,
        },
        insertOnly: { code: m.code },
      };
    }),
    fixed,
  );

  // match_slot.
  const slots = ok(
    await client
      .from('match_slot')
      .select('*')
      .in('match_id', [...matchIds.values()]),
    'read match_slot',
  );
  const slotKey = (matchId: string, slotNo: number) => `${matchId}:${slotNo}`;
  await syncRows(
    ctx,
    'match_slot',
    slots,
    (r: Tables<'match_slot'>) => slotKey(r.match_id, r.slot_no),
    data.matches.flatMap((m) =>
      m.slots.map((s) => ({
        key: slotKey(matchIds.get(m.code)!, s.slot_no),
        compare: {
          slot_type: s.slot_type,
          home_p1: bySlug.get(s.home[0])!,
          home_p2: bySlug.get(s.home[1])!,
          away_p1: bySlug.get(s.away[0])!,
          away_p2: bySlug.get(s.away[1])!,
          handicap_home: s.handicap_home,
          handicap_away: s.handicap_away,
          score_home: s.score_home,
          score_away: s.score_away,
        },
        insertOnly: { match_id: matchIds.get(m.code)!, slot_no: s.slot_no },
      })),
    ),
  );

  // group_closure: the final group order.
  const closures = ok(await client.from('group_closure').select('*').eq('season_id', seasonId), 'read group_closure');
  await syncRows(ctx, 'group_closure', closures, (r: Tables<'group_closure'>) => r.season_id, [
    {
      key: seasonId,
      compare: { final_order: computeGroupStandings(data).rows.map((r) => teamNo.get(Number(r.teamId))!) },
      insertOnly: { season_id: seasonId, manual_draws: {} },
    },
  ]);

  // award, then winners for awards that have none yet.
  const awards = ok(await client.from('award').select('*').eq('season_id', seasonId), 'read award');
  const awardIds = await syncRows(
    ctx,
    'award',
    awards,
    (r: Tables<'award'>) => String(r.sort_order),
    data.awards.map((a) => ({
      key: String(a.sortOrder),
      compare: {
        name_vi: a.nameVi,
        criteria_vi: a.criteriaVi,
        sponsor: a.sponsor,
        value_vnd: a.valueVnd,
        note: a.note,
      },
      insertOnly: { sort_order: a.sortOrder },
    })),
    fixed,
  );
  const withWinners = new Set(
    ok(
      await client
        .from('award_winner')
        .select('award_id')
        .in('award_id', [...awardIds.values()]),
      'read award_winner',
    ).map((w) => w.award_id),
  );
  const winners: Record<string, unknown>[] = [];
  const members: Record<string, unknown>[] = [];
  for (const a of data.awards) {
    const awardId = awardIds.get(String(a.sortOrder))!;
    if (withWinners.has(awardId)) continue;
    if (a.unparsed) ctx.warnings.push(`Award ${a.sortOrder}: winners not parsed, add them by hand in A7`);
    for (const w of a.winners) {
      const id = randomUUID();
      const matchCode = w.kind === 'pair' ? w.matchCode : null;
      winners.push({
        id,
        award_id: awardId,
        kind: w.kind,
        team_id: w.kind === 'team' ? teamNo.get(w.teamNumber)! : null,
        match_id: matchCode ? matchIds.get(matchCode)! : null,
        note: w.kind === 'team' ? null : w.note,
      });
      const slugs = w.kind === 'pair' ? w.players : w.kind === 'player' ? [w.player] : [];
      for (const slug of slugs) members.push({ award_winner_id: id, season_player_id: bySlug.get(slug)! });
      ctx.changes.push({ table: 'award_winner', action: 'insert', key: `${a.sortOrder}`, fields: [] });
      for (const slug of slugs)
        ctx.changes.push({ table: 'award_winner_member', action: 'insert', key: slug, fields: [] });
    }
  }
  if (winners.length > 0)
    await write(ctx, 'insert award_winner', () => client.from('award_winner').insert(winners as never));
  if (members.length > 0)
    await write(ctx, 'insert award_winner_member', () => client.from('award_winner_member').insert(members as never));

  return { changes: ctx.changes, warnings: ctx.warnings };
}
