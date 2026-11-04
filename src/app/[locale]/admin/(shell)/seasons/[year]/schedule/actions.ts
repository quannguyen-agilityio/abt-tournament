'use server';

import { generateRoundRobin } from '@/domain/schedule';
import { DEFAULT_SEASON_SETTINGS, parseSeasonSettings } from '@/domain/settings';
import { requireBtc } from '@/lib/auth/session';
import { isUuid } from '@/lib/auth/users';
import { invalidatePublicData } from '@/lib/public-cache';
import { parseMatchSlot, type MatchSlotError, type MatchSlotInput } from '@/lib/schedule';
import { parseSlotChanges, type SlotChange } from '@/lib/schedule-draft';
import { createClient } from '@/lib/supabase/server';

export type GenerateScheduleState = { ok: true; count: number } | { error: 'teams' | 'locked' | 'failed' } | undefined;
export type MatchSlotsState =
  { ok: true } | { ok: false; errors: Record<string, MatchSlotError[]> } | { error: 'locked' | 'failed' };

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

  invalidatePublicData();
  return { ok: true, count: data };
}

/**
 * Saves the slots of a schedule draft in one transaction (save_match_slots): date, time, court and
 * referee of each changed match. Slots that cannot be saved come back by match id, and nothing is
 * written. `locked`: a match has started or ended, or the season is past the group stage.
 */
export async function saveMatchSlots(seasonId: string, changes: SlotChange[]): Promise<MatchSlotsState> {
  await requireBtc();
  // Arguments come from the client as they are: check them again.
  const parsed = parseSlotChanges(changes);
  if (typeof seasonId !== 'string' || !isUuid(seasonId) || !parsed) return { error: 'failed' };
  if (parsed.length === 0) return { ok: true };

  const supabase = await createClient();
  const settings = await seasonSettings(supabase, seasonId);
  if (!settings) return { error: 'failed' };

  const errors: Record<string, MatchSlotError[]> = {};
  const slots: { matchId: string; value: MatchSlotInput }[] = [];
  for (const change of parsed) {
    const slot = parseMatchSlot(change, settings.timezone);
    if (slot.ok) slots.push({ matchId: change.matchId, value: slot.value });
    else errors[change.matchId] = slot.errors;
  }

  // save_match_slots checks these too; checking here first tells which rows are wrong. The court must
  // be the season's, and a newly chosen referee an active account.
  const courtIds = [...new Set(slots.flatMap((s) => s.value.courtId ?? []))];
  const refereeIds = [...new Set(slots.flatMap((s) => s.value.refereeId ?? []))];
  const [courts, referees, matches] = await Promise.all([
    supabase.from('court').select('id').eq('season_id', seasonId).in('id', courtIds),
    supabase.from('profile').select('user_id').eq('is_active', true).in('user_id', refereeIds),
    supabase
      .from('match')
      .select('id, referee_id')
      .eq('season_id', seasonId)
      .in(
        'id',
        slots.map((s) => s.matchId),
      ),
  ]);
  if (courts.error || referees.error || matches.error) return { error: 'failed' };
  const seasonCourts = new Set(courts.data.map((c) => c.id));
  const activeReferees = new Set(referees.data.map((p) => p.user_id));
  const savedReferee = new Map(matches.data.map((m) => [m.id, m.referee_id]));
  for (const { matchId, value } of slots) {
    if (!savedReferee.has(matchId)) return { error: 'failed' };
    const slotErrors: MatchSlotError[] = [];
    if (value.courtId && !seasonCourts.has(value.courtId)) slotErrors.push('court');
    if (value.refereeId && value.refereeId !== savedReferee.get(matchId) && !activeReferees.has(value.refereeId)) {
      slotErrors.push('referee');
    }
    if (slotErrors.length > 0) errors[matchId] = slotErrors;
  }
  if (Object.keys(errors).length > 0) return { ok: false, errors };

  const { error } = await supabase.rpc('save_match_slots', {
    p_season_id: seasonId,
    p_slots: slots.map(({ matchId, value }) => ({
      match_id: matchId,
      scheduled_at: value.scheduledAt?.toISOString() ?? null,
      court_id: value.courtId,
      referee_id: value.refereeId,
    })),
  });
  if (error) return { error: error.code === 'P0001' ? 'locked' : 'failed' };

  invalidatePublicData();
  return { ok: true };
}
