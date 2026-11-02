// Throwaway seasons for the E2E smoke tests (spec §11). Each test that writes data gets a season of its
// own, far from the seed years, so it can run again on the same local database and never touches the
// ABT 2025/2027 demo. The fixtures write straight to the tables as the seed BTC account, which RLS lets
// do everything (the service role cannot run the triggers in the private schema); they skip the server
// actions, as the seed does.

import { createClient } from '@supabase/supabase-js';
import type { Database } from '../../src/lib/database.types';
import { BTC } from './auth';

/** The seed referee (README "Seed accounts"); fixture matches are assigned to them. */
export const REFEREE_ID = '10000000-0000-0000-0000-000000000002';

const SETTINGS = {
  set_target: 31,
  sets_per_match: 5,
  slot_types: ['open', 'low', 'open', 'high', 'open'],
  low_rank_range: { min: 4, max: 7 },
  high_rank_range: { min: 1, max: 3 },
  max_rank: 7,
  group_handicap_cap: 20,
  ko_handicap_cap: 15,
  relay_milestones: [25, 50, 75, 100, 125],
  min_sets_per_player: 1,
  max_sets_per_player: 2,
  min_players_present: 5,
  knockout_teams: 4,
  fees: { employee: 300000, intern: 150000, guest: 300000 },
  timezone: 'Asia/Ho_Chi_Minh',
};

const TEAMS = [
  { name: 'Thử Đỏ', color: '#c62828' },
  { name: 'Thử Xanh', color: '#1565c0' },
  { name: 'Thử Lục', color: '#2e7d32' },
  { name: 'Thử Tím', color: '#6a1b9a' },
];
const LETTERS = ['a', 'b', 'c', 'd'];

/** Member k (0-based) of every team has rank RANKS[k]; equal skill points per rank keep handicaps at 0. */
const RANKS = [1, 2, 3, 4, 5, 6, 7, 7];

/**
 * The lineup of every fixture match, as member indexes per set: set 2 (low) has ranks 4 and 7, set 4
 * (high) ranks 1 and 3, members 0 and 6 play twice and never in consecutive sets (spec §4.1).
 */
export const LINEUP: [number, number][] = [
  [0, 4],
  [3, 6],
  [1, 5],
  [0, 2],
  [6, 7],
];

/** Round robin of 4 teams (team indexes), V01..V06. */
const SCHEDULE: [number, number][] = [
  [0, 1],
  [2, 3],
  [0, 2],
  [1, 3],
  [0, 3],
  [1, 2],
];

export type FixturePlayer = { id: string; name: string; rank: number; skillPoints: number };
export type FixtureTeam = { id: string; name: string; color: string; players: FixturePlayer[] };
export type FixtureMatch = { id: string; code: string; home: FixtureTeam; away: FixtureTeam };
export type FixtureSeason = { id: string; year: number; teams: FixtureTeam[]; matches: FixtureMatch[] };

type Client = ReturnType<typeof createClient<Database>>;

/** A Supabase client signed in as the seed BTC. */
export async function btcClient(): Promise<Client> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error('Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY (.env.local) for the E2E tests.');
  }
  const db = createClient<Database>(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
  const { error } = await db.auth.signInWithPassword(BTC);
  if (error) throw new Error(`sign in as the BTC: ${error.message}`);
  return db;
}

function check<T>(result: { data: T; error: { message: string } | null }, what: string): T {
  if (result.error) throw new Error(`${what}: ${result.error.message}`);
  return result.data;
}

/** The data of a query that must return rows (supabase-js types it as nullable). */
function row<T>(result: { data: T; error: { message: string } | null }, what: string): NonNullable<T> {
  const data = check(result, what);
  if (data === null || data === undefined) throw new Error(`${what}: no row`);
  return data;
}

/** Deletes a fixture season and everything in it, child rows first (there are no cascades). */
export async function dropFixtureSeason(year: number, client?: Client) {
  const db = client ?? (await btcClient());
  const season = check(await db.from('season').select('id').eq('year', year).maybeSingle(), 'find season');
  if (season) {
    const matchIds = row(await db.from('match').select('id').eq('season_id', season.id), 'list matches').map(
      (m) => m.id,
    );
    const slotIds = matchIds.length
      ? row(await db.from('match_slot').select('id').in('match_id', matchIds), 'list slots').map((s) => s.id)
      : [];
    if (slotIds.length)
      check(await db.from('slot_substitution').delete().in('match_slot_id', slotIds), 'substitutions');
    if (matchIds.length) {
      check(await db.from('lineup_override').delete().in('match_id', matchIds), 'overrides');
      check(await db.from('match_attendance').delete().in('match_id', matchIds), 'attendance');
      check(await db.from('match_slot').delete().in('match_id', matchIds), 'slots');
    }
    check(await db.from('group_closure').delete().eq('season_id', season.id), 'closure');
    check(await db.from('match').delete().eq('season_id', season.id), 'matches');
    check(await db.from('team').update({ captain_id: null }).eq('season_id', season.id), 'captains');
    check(await db.from('season_player').delete().eq('season_id', season.id), 'players');
    check(await db.from('team').delete().eq('season_id', season.id), 'teams');
    check(await db.from('court').delete().eq('season_id', season.id), 'courts');
    check(await db.from('season').delete().eq('id', season.id), 'season');
  }
  check(await db.from('person').delete().like('slug', `e2e-${year}-%`), 'people');
}

/**
 * A season in the group stage with 4 teams of 8 players, one court and the 6 group matches V01..V06, all
 * scheduled today on "Sân 1" with the seed referee. A leftover season of the same year is dropped first.
 */
export async function createFixtureSeason(year: number): Promise<FixtureSeason> {
  const db = await btcClient();
  await dropFixtureSeason(year, db);
  const today = new Date().toISOString().slice(0, 10);

  const season = row(
    await db
      .from('season')
      .insert({
        year,
        name: `ABT ${year}`,
        venue: 'Nhà thi đấu Thử',
        status: 'group',
        settings: SETTINGS,
        match_days: [today],
      })
      .select('id')
      .single(),
    'season',
  );
  const court = row(
    await db.from('court').insert({ season_id: season.id, name: 'Sân 1', sort_order: 1 }).select('id').single(),
    'court',
  );

  const teams: FixtureTeam[] = [];
  for (const [t, { name, color }] of TEAMS.entries()) {
    const team = row(await db.from('team').insert({ season_id: season.id, name, color }).select('id').single(), 'team');
    const people = row(
      await db
        .from('person')
        .insert(
          RANKS.map((_, k) => ({
            full_name: `${name} ${k + 1}`,
            slug: `e2e-${year}-${LETTERS[t]}${k + 1}`,
            gender: 'male' as const,
          })),
        )
        .select('id, full_name, slug'),
      'people',
    ).sort((a, b) => a.slug.localeCompare(b.slug, 'en', { numeric: true }));
    const players = row(
      await db
        .from('season_player')
        .insert(
          people.map((person, k) => ({
            season_id: season.id,
            person_id: person.id,
            team_id: team.id,
            rank: RANKS[k],
            skill_points: 40 - 4 * RANKS[k],
          })),
        )
        .select('id, person_id, rank, skill_points'),
      'season players',
    );
    const byPerson = new Map(players.map((p) => [p.person_id, p]));
    const members = people.map((person) => {
      const p = byPerson.get(person.id)!;
      return { id: p.id, name: person.full_name, rank: p.rank, skillPoints: p.skill_points };
    });
    check(await db.from('team').update({ captain_id: members[0].id }).eq('id', team.id), 'captain');
    teams.push({ id: team.id, name, color, players: members });
  }

  const matches: FixtureMatch[] = [];
  for (const [i, [h, a]] of SCHEDULE.entries()) {
    const code = `V${String(i + 1).padStart(2, '0')}`;
    const match = row(
      await db
        .from('match')
        .insert({
          season_id: season.id,
          code,
          stage: 'group',
          round: Math.floor(i / 2) + 1,
          home_team_id: teams[h].id,
          away_team_id: teams[a].id,
          scheduled_at: new Date(Date.now() + i * 60 * 60 * 1000).toISOString(),
          court_id: court.id,
          referee_id: REFEREE_ID,
        })
        .select('id')
        .single(),
      'match',
    );
    check(
      await db.from('match_slot').insert(
        SETTINGS.slot_types.map((slotType, n) => ({
          match_id: match.id,
          slot_no: n + 1,
          slot_type: slotType as Database['public']['Enums']['slot_type'],
        })),
      ),
      'slots',
    );
    matches.push({ id: match.id, code, home: teams[h], away: teams[a] });
  }

  return { id: season.id, year, teams, matches };
}

/**
 * Plays a fixture match to completion without the UI: attendance, the LINEUP template and 5 set scores.
 * The winner takes sets 1-3 31–20 and loses sets 4-5 20–31, so every win is 3–2 with +11 points.
 */
export async function completeFixtureMatch(match: FixtureMatch, homeWins: boolean) {
  const db = await btcClient();
  check(
    await db
      .from('match_attendance')
      .insert(
        [match.home, match.away].flatMap((team) =>
          team.players.map((p) => ({ match_id: match.id, team_id: team.id, season_player_id: p.id })),
        ),
      ),
    'attendance',
  );
  for (const [n, [p1, p2]] of LINEUP.entries()) {
    const winnerSet = n < 3;
    const homeSet = winnerSet === homeWins;
    check(
      await db
        .from('match_slot')
        .update({
          home_p1: match.home.players[p1].id,
          home_p2: match.home.players[p2].id,
          away_p1: match.away.players[p1].id,
          away_p2: match.away.players[p2].id,
          score_home: homeSet ? 31 : 20,
          score_away: homeSet ? 20 : 31,
        })
        .eq('match_id', match.id)
        .eq('slot_no', n + 1),
      'slot',
    );
  }
  check(
    await db
      .from('match')
      .update({ status: 'completed', winner_team_id: homeWins ? match.home.id : match.away.id })
      .eq('id', match.id),
    'complete',
  );
}
