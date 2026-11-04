import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import { cacheLife, cacheTag } from 'next/cache';
import { cache } from 'react';

import { DEFAULT_SEASON_SETTINGS, parseSeasonSettings, type SeasonSettings } from '@/domain/settings';
import type { Database } from '@/lib/database.types';
import type { AwardInput } from '@/lib/public-awards';
import type { MatchDetailInput, MatchPlayer } from '@/lib/public-match';
import type { ScheduleMatchInput } from '@/lib/public-matches';
import type { PublicTeam } from '@/lib/public-standings';
import type { ProfileMatch } from '@/lib/public-players';
import { PUBLIC_DATA_TAG } from '@/lib/public-cache';
import type { PublicPlayer } from '@/lib/public-teams';
import { createPublicClient } from '@/lib/supabase/public';
import { createClient, hasSessionCookie } from '@/lib/supabase/server';

type Supabase = SupabaseClient<Database>;

export interface PublicSeason {
  id: string;
  year: number;
  name: string;
  venue: string;
  status: Database['public']['Enums']['season_status'];
  settings: SeasonSettings;
  matchDays: string[];
}

/** A match with its court name and slot scores, as the public pages read it. */
export interface SeasonMatch {
  id: string;
  code: string;
  stage: Database['public']['Enums']['match_stage'];
  status: Database['public']['Enums']['match_status'];
  home_team_id: string | null;
  away_team_id: string | null;
  forfeit_team_id: string | null;
  forfeit_reason: string | null;
  scheduled_at: string | null;
  winner_team_id: string | null;
  court: string | null;
  slots: { slot_no: number; score_home: number | null; score_away: number | null }[];
}

// The readers: each queries through the client it is given, so RLS decides what it returns.

/** The season of `year`, or null when it does not exist or RLS hides it (a draft). */
async function readPublicSeason(supabase: Supabase, year: number): Promise<PublicSeason | null> {
  const { data, error } = await supabase
    .from('season')
    .select('id, year, name, venue, status, settings, match_days')
    .eq('year', year)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const parsed = parseSeasonSettings(data.settings);
  return {
    id: data.id,
    year: data.year,
    name: data.name,
    venue: data.venue,
    status: data.status,
    settings: parsed.ok ? parsed.settings : DEFAULT_SEASON_SETTINGS,
    matchDays: data.match_days,
  };
}

async function readSeasonTeams(supabase: Supabase, seasonId: string): Promise<PublicTeam[]> {
  const { data, error } = await supabase
    .from('team')
    .select('id, name, color, disqualified_at, disqualified_reason')
    .eq('season_id', seasonId)
    .order('name');
  if (error) throw error;
  return data.map((t) => ({
    id: t.id,
    name: t.name,
    color: t.color,
    disqualified: t.disqualified_at !== null,
    disqualifiedReason: t.disqualified_reason,
  }));
}

/** Each team's captain (a `season_player` id), by team id. */
async function readTeamCaptains(supabase: Supabase, seasonId: string): Promise<Map<string, string | null>> {
  const { data, error } = await supabase.from('team').select('id, captain_id').eq('season_id', seasonId);
  if (error) throw error;
  return new Map(data.map((t) => [t.id, t.captain_id]));
}

/** Every player registered in the season, withdrawn ones included, with their person. */
async function readSeasonPlayers(supabase: Supabase, seasonId: string): Promise<PublicPlayer[]> {
  const { data, error } = await supabase
    .from('season_player')
    .select('id, person_id, team_id, rank, skill_points, status, person(full_name, slug, gender, avatar_url)')
    .eq('season_id', seasonId);
  if (error) throw error;
  return data.map((p) => ({
    id: p.id,
    personId: p.person_id,
    slug: p.person.slug,
    name: p.person.full_name,
    gender: p.person.gender,
    avatarUrl: p.person.avatar_url,
    teamId: p.team_id,
    rank: p.rank,
    skill: p.skill_points,
    status: p.status,
  }));
}

/**
 * Completed group matches with their slot players and substitutions: what the player stats count.
 * Only these are read, to keep the P7 payload small.
 */
async function readProfileMatches(supabase: Supabase, seasonId: string): Promise<ProfileMatch[]> {
  const { data, error } = await supabase
    .from('match')
    .select(
      `id, code, stage, status, home_team_id, away_team_id, forfeit_team_id,
      match_slot(slot_no, slot_type, home_p1, home_p2, away_p1, away_p2, score_home, score_away,
        slot_substitution(side, replaced_id, substitute_id, created_at))`,
    )
    .eq('season_id', seasonId)
    .eq('stage', 'group')
    .eq('status', 'completed');
  if (error) throw error;
  return data.map(({ match_slot: slots, ...match }) => ({
    ...match,
    slots: slots.map(({ slot_substitution: subs, ...slot }) => ({
      ...slot,
      substitutions: [...subs]
        .sort((a, b) => a.created_at.localeCompare(b.created_at))
        .map(({ side, replaced_id, substitute_id }) => ({ side, replaced_id, substitute_id })),
    })),
  }));
}

export interface PlayerSeason {
  year: number;
  name: string;
  team: { name: string; color: string } | null;
  rank: number;
  skill: number;
  status: 'active' | 'withdrawn';
}

/** Every season a person played, newest first. RLS hides draft seasons, so `!inner` drops them. */
async function readPersonHistory(supabase: Supabase, personId: string): Promise<PlayerSeason[]> {
  const { data, error } = await supabase
    .from('season_player')
    .select('rank, skill_points, status, season!inner(year, name), team!season_player_team_id_fkey(name, color)')
    .eq('person_id', personId);
  if (error) throw error;
  return data
    .map((p) => ({
      year: p.season.year,
      name: p.season.name,
      team: p.team,
      rank: p.rank,
      skill: p.skill_points,
      status: p.status,
    }))
    .sort((a, b) => b.year - a.year);
}

/** The final team order fixed when the group closed, or null while it is open. */
async function readGroupClosure(supabase: Supabase, seasonId: string): Promise<string[] | null> {
  const { data, error } = await supabase
    .from('group_closure')
    .select('final_order')
    .eq('season_id', seasonId)
    .maybeSingle();
  if (error) throw error;
  return data ? data.final_order : null;
}

/** Group matches, or every knock-out match (semi-finals, third place, final). */
async function readSeasonMatches(
  supabase: Supabase,
  seasonId: string,
  stage: 'group' | 'knockout',
): Promise<SeasonMatch[]> {
  const query = supabase
    .from('match')
    .select(
      'id, code, stage, status, home_team_id, away_team_id, forfeit_team_id, forfeit_reason, scheduled_at, winner_team_id, court(name), match_slot(slot_no, score_home, score_away)',
    )
    .eq('season_id', seasonId);
  const { data, error } = await (stage === 'group' ? query.eq('stage', 'group') : query.neq('stage', 'group'));
  if (error) throw error;
  return data.map(({ court, match_slot: slots, ...match }) => ({
    ...match,
    court: court?.name ?? null,
    slots: [...slots].sort((a, b) => a.slot_no - b.slot_no),
  }));
}

async function readSeasonCourts(supabase: Supabase, seasonId: string): Promise<{ id: string; name: string }[]> {
  const { data, error } = await supabase.from('court').select('id, name').eq('season_id', seasonId).order('sort_order');
  if (error) throw error;
  return data;
}

/** Every match of the season with only what a schedule card needs, to keep the P3 payload small. */
async function readSeasonSchedule(supabase: Supabase, seasonId: string): Promise<ScheduleMatchInput[]> {
  const { data, error } = await supabase
    .from('match')
    .select(
      'id, code, stage, round, status, home_team_id, away_team_id, forfeit_team_id, winner_team_id, scheduled_at, court_id, match_slot(slot_no, score_home, score_away)',
    )
    .eq('season_id', seasonId);
  if (error) throw error;
  return data.map(({ match_slot: slots, ...match }) => ({ ...match, slots }));
}

export interface MatchDetail extends MatchDetailInput {
  court: string | null;
  referee: string | null;
  players: Map<string, MatchPlayer>;
}

/**
 * One match of the season by code, with its slots, substitutions, the players they name and the
 * referee's display name. RLS returns no slots until the lineup is public (A6).
 */
async function readMatchDetail(supabase: Supabase, seasonId: string, code: string): Promise<MatchDetail | null> {
  const { data, error } = await supabase
    .from('match')
    .select(
      `id, code, stage, round, status, status_before_annul, home_team_id, away_team_id, forfeit_team_id,
      forfeit_reason, winner_team_id, scheduled_at, referee_id, relay_handicap_home, relay_handicap_away,
      court(name),
      match_slot(slot_no, slot_type, home_p1, home_p2, away_p1, away_p2, handicap_home, handicap_away,
        score_home, score_away, slot_substitution(side, replaced_id, substitute_id, reason, created_at))`,
    )
    .eq('season_id', seasonId)
    .eq('code', code)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  const { court, referee_id: refereeId, match_slot: rows, ...match } = data;
  const slots = rows.map(({ slot_substitution: subs, ...slot }) => ({
    ...slot,
    substitutions: [...subs]
      .sort((a, b) => a.created_at.localeCompare(b.created_at))
      .map(({ side, replaced_id, substitute_id, reason }) => ({ side, replaced_id, substitute_id, reason })),
  }));
  const ids = [
    ...new Set(
      slots.flatMap((s) => [
        s.home_p1,
        s.home_p2,
        s.away_p1,
        s.away_p2,
        ...s.substitutions.flatMap((sub) => [sub.replaced_id, sub.substitute_id]),
      ]),
    ),
  ].filter((id): id is string => id !== null);

  const [players, referee] = await Promise.all([
    ids.length === 0
      ? Promise.resolve({ data: [], error: null })
      : supabase.from('season_player').select('id, rank, skill_points, person(full_name, slug)').in('id', ids),
    refereeId
      ? supabase.from('referee_name').select('display_name').eq('user_id', refereeId).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);
  if (players.error) throw players.error;
  if (referee.error) throw referee.error;

  return {
    ...match,
    slots,
    court: court?.name ?? null,
    referee: referee.data?.display_name ?? null,
    players: new Map(
      players.data.map((p) => [
        p.id,
        { id: p.id, name: p.person.full_name, slug: p.person.slug, rank: p.rank, skill: p.skill_points },
      ]),
    ),
  };
}

/** The season's side awards with their winners, the players they name and the related match. */
async function readSeasonAwards(supabase: Supabase, seasonId: string): Promise<AwardInput[]> {
  const { data, error } = await supabase
    .from('award')
    .select(
      `id, sort_order, name_vi, name_en, criteria_vi, criteria_en, sponsor, value_vnd,
      award_winner(id, kind, note, created_at, team(id, name, color), match(code),
        award_winner_member(season_player(id, person(full_name, slug))))`,
    )
    .eq('season_id', seasonId);
  if (error) throw error;
  return data.map(({ award_winner: winners, ...award }) => ({
    ...award,
    winners: winners.map(({ award_winner_member: members, ...winner }) => ({
      ...winner,
      members: members.map(({ season_player: p }) => ({ id: p.id, name: p.person.full_name, slug: p.person.slug })),
    })),
  }));
}

const readers = {
  publicSeason: readPublicSeason,
  seasonTeams: readSeasonTeams,
  teamCaptains: readTeamCaptains,
  seasonPlayers: readSeasonPlayers,
  profileMatches: readProfileMatches,
  personHistory: readPersonHistory,
  groupClosure: readGroupClosure,
  seasonMatches: readSeasonMatches,
  seasonCourts: readSeasonCourts,
  seasonSchedule: readSeasonSchedule,
  matchDetail: readMatchDetail,
  seasonAwards: readSeasonAwards,
};

type Readers = typeof readers;
type ReaderKey = keyof Readers;
type ReaderArgs<K extends ReaderKey> = Parameters<Readers[K]> extends [Supabase, ...infer A] ? A : never;
type ReaderResult<K extends ReaderKey> = Awaited<ReturnType<Readers[K]>>;

// TypeScript cannot narrow `readers[key]` to the one reader `key` names, hence the cast.
function reader<K extends ReaderKey>(key: K) {
  return readers[key] as unknown as (supabase: Supabase, ...args: ReaderArgs<K>) => Promise<ReaderResult<K>>;
}

/** What referees write during a match: scores, lineups, substitutions, results. */
const LIVE_READERS: ReadonlySet<ReaderKey> = new Set([
  'profileMatches',
  'seasonMatches',
  'seasonSchedule',
  'matchDetail',
]);

/**
 * Live data is kept 10 s before a refresh in the background, everything else a minute. Admin actions
 * expire the tag (`invalidatePublicData()`), so these lifetimes only bound how stale a server instance
 * that did not run the action can be. Under 5 minutes, so pages never prerender this data.
 */
const LIVE_LIFE = { stale: 30, revalidate: 10, expire: 60 };

/** Reads as anon and keeps the result in the server cache, shared by every anonymous visitor. */
async function cachedRead<K extends ReaderKey>(key: K, ...args: ReaderArgs<K>): Promise<ReaderResult<K>> {
  'use cache';
  cacheTag(PUBLIC_DATA_TAG);
  if (LIVE_READERS.has(key)) cacheLife(LIVE_LIFE);
  else cacheLife('minutes');
  return reader(key)(createPublicClient(), ...args);
}

/**
 * A signed-in BTC member or referee may see more than the public (draft seasons, lineups before the
 * lock), so their reads go through their session and are not cached. Everyone else shares the cache.
 */
async function read<K extends ReaderKey>(key: K, ...args: ReaderArgs<K>): Promise<ReaderResult<K>> {
  if (await hasSessionCookie()) return reader(key)(await createClient(), ...args);
  return cachedRead(key, ...args);
}

// React's cache() also shares a read between a layout and its page within one request.
export const getPublicSeason = cache((year: number) => read('publicSeason', year));
export const getSeasonTeams = cache((seasonId: string) => read('seasonTeams', seasonId));
export const getTeamCaptains = cache((seasonId: string) => read('teamCaptains', seasonId));
export const getSeasonPlayers = cache((seasonId: string) => read('seasonPlayers', seasonId));
export const getProfileMatches = cache((seasonId: string) => read('profileMatches', seasonId));
export const getPersonHistory = cache((personId: string) => read('personHistory', personId));
export const getGroupClosure = cache((seasonId: string) => read('groupClosure', seasonId));
export const getSeasonMatches = cache((seasonId: string, stage: 'group' | 'knockout') =>
  read('seasonMatches', seasonId, stage),
);
export const getSeasonCourts = cache((seasonId: string) => read('seasonCourts', seasonId));
export const getSeasonSchedule = cache((seasonId: string) => read('seasonSchedule', seasonId));
export const getMatchDetail = cache((seasonId: string, code: string) => read('matchDetail', seasonId, code));
export const getSeasonAwards = cache((seasonId: string) => read('seasonAwards', seasonId));
