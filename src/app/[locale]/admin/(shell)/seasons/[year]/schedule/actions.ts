'use server';

import { refresh } from 'next/cache';

import { generateRoundRobin } from '@/domain/schedule';
import { DEFAULT_SEASON_SETTINGS, parseSeasonSettings } from '@/domain/settings';
import { requireBtc } from '@/lib/auth/session';
import { isUuid } from '@/lib/auth/users';
import { parseMatchSlot, type MatchSlotError } from '@/lib/schedule';
import { createClient } from '@/lib/supabase/server';

export type GenerateScheduleState = { ok: true; count: number } | { error: 'teams' | 'locked' | 'failed' } | undefined;
export type MatchSlotState = { ok: true } | { ok: false; errors: MatchSlotError[] } | { error: 'failed' } | undefined;

type Supabase = Awaited<ReturnType<typeof createClient>>;

async function seasonSettings(supabase: Supabase, seasonId: string) {
  const { data } = await supabase.from('season').select('settings').eq('id', seasonId).maybeSingle();
  if (!data) return null;
  const parsed = parseSeasonSettings(data.settings);
  return parsed.ok ? parsed.settings : DEFAULT_SEASON_SETTINGS;
}

/**
 * Generates the round-robin (spec §4.7) and replaces the group matches with it. The database
 * refuses once a group match has a lineup or a score.
 */
export async function generateSchedule(
  _prev: GenerateScheduleState,
  formData: FormData,
): Promise<GenerateScheduleState> {
  await requireBtc();
  const seasonId = String(formData.get('seasonId') ?? '');
  if (!isUuid(seasonId)) return { error: 'failed' };

  // The user session, not the service role: RLS lets the BTC write and nobody else.
  const supabase = await createClient();
  const settings = await seasonSettings(supabase, seasonId);
  if (!settings) return { error: 'failed' };

  const { data: teams, error: teamsError } = await supabase
    .from('team')
    .select('id')
    .eq('season_id', seasonId)
    .order('name')
    .order('id');
  if (teamsError) return { error: 'failed' };
  if (teams.length < 2) return { error: 'teams' };

  const matches = generateRoundRobin(teams.map((team) => team.id)).map((m) => ({
    code: m.code,
    round: m.round,
    home_team_id: m.home,
    away_team_id: m.away,
  }));
  const { data, error } = await supabase.rpc('generate_group_schedule', {
    p_season_id: seasonId,
    p_matches: matches,
    p_slot_types: settings.slot_types,
  });
  if (error) return { error: error.code === 'P0001' ? 'locked' : 'failed' };

  refresh();
  return { ok: true, count: data };
}

/** Sets the date, time, court and referee of one match; blanks clear them. */
export async function updateMatchSlot(_prev: MatchSlotState, formData: FormData): Promise<MatchSlotState> {
  await requireBtc();
  const seasonId = String(formData.get('seasonId') ?? '');
  const matchId = String(formData.get('matchId') ?? '');
  if (!isUuid(seasonId) || !isUuid(matchId)) return { error: 'failed' };

  const supabase = await createClient();
  const settings = await seasonSettings(supabase, seasonId);
  if (!settings) return { error: 'failed' };
  const parsed = parseMatchSlot(formData, settings.timezone);
  if (!parsed.ok) return parsed;
  const { scheduledAt, courtId, refereeId } = parsed.value;

  // A form could be tampered with: the court must be the season's, the referee an active account.
  if (courtId) {
    const { data } = await supabase
      .from('court')
      .select('id')
      .eq('id', courtId)
      .eq('season_id', seasonId)
      .maybeSingle();
    if (!data) return { ok: false, errors: ['court'] };
  }
  if (refereeId) {
    const { data } = await supabase
      .from('profile')
      .select('user_id')
      .eq('user_id', refereeId)
      .eq('is_active', true)
      .maybeSingle();
    if (!data) return { ok: false, errors: ['referee'] };
  }

  const { data, error } = await supabase
    .from('match')
    .update({ scheduled_at: scheduledAt?.toISOString() ?? null, court_id: courtId, referee_id: refereeId })
    .eq('id', matchId)
    .eq('season_id', seasonId)
    .select('id');
  if (error || data.length === 0) return { error: 'failed' };

  refresh();
  return { ok: true };
}
