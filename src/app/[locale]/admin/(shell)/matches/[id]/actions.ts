'use server';

import { refresh } from 'next/cache';

import { validateLineup, type LineupAttendance, type Side } from '@/domain/lineup';
import { DEFAULT_SEASON_SETTINGS, parseSeasonSettings } from '@/domain/settings';
import { requireStaff } from '@/lib/auth/session';
import { attendanceEditable, parseAttendanceForm } from '@/lib/match-attendance';
import { lineupEditable, overridable, parseLineupForm } from '@/lib/match-lineup';
import { createClient } from '@/lib/supabase/server';

export type AttendanceState = { ok: true; count: number } | { error: 'locked' | 'invalid' | 'failed' } | undefined;

/** Replaces one team's attendance for a match with the ticked players (A5 step 1). */
export async function saveAttendance(_prev: AttendanceState, formData: FormData): Promise<AttendanceState> {
  await requireStaff();
  const input = parseAttendanceForm(formData);
  if (!input) return { error: 'invalid' };
  const { matchId, teamId, playerIds } = input;

  // The user session: RLS lets the BTC write any match and a referee only open ones.
  const supabase = await createClient();
  const { data: match } = await supabase
    .from('match')
    .select('season_id, status, home_team_id, away_team_id')
    .eq('id', matchId)
    .maybeSingle();
  if (!match || (teamId !== match.home_team_id && teamId !== match.away_team_id)) return { error: 'invalid' };
  if (!attendanceEditable(match.status)) return { error: 'locked' };

  // A form could be tampered with: every ticked player must be an active member of this team.
  if (playerIds.length > 0) {
    const { data: players, error } = await supabase
      .from('season_player')
      .select('id')
      .in('id', playerIds)
      .eq('season_id', match.season_id)
      .eq('team_id', teamId)
      .eq('status', 'active');
    if (error) return { error: 'failed' };
    if (players.length !== playerIds.length) return { error: 'invalid' };
  }

  let removal = supabase.from('match_attendance').delete().eq('match_id', matchId).eq('team_id', teamId);
  if (playerIds.length > 0) removal = removal.not('season_player_id', 'in', `(${playerIds.join(',')})`);
  const { error: deleteError } = await removal;
  if (deleteError) return { error: 'failed' };

  if (playerIds.length > 0) {
    const { error: insertError } = await supabase.from('match_attendance').upsert(
      playerIds.map((id) => ({ match_id: matchId, team_id: teamId, season_player_id: id })),
      { onConflict: 'match_id,season_player_id', ignoreDuplicates: true },
    );
    if (insertError) return { error: 'failed' };
  }

  refresh();
  return { ok: true, count: playerIds.length };
}

export type LineupState =
  { ok: true } | { error: 'locked' | 'invalid' | 'violations' | 'reason' | 'failed' } | undefined;

/**
 * Saves one team's lineup (A5 step 2). The rules are checked again here on the saved attendance: a
 * referee cannot save a lineup with violations, the BTC can with a reason, which records one
 * `lineup_override` per broken rule (spec §4.1).
 */
export async function saveLineup(_prev: LineupState, formData: FormData): Promise<LineupState> {
  const viewer = await requireStaff();
  const input = parseLineupForm(formData);
  if (!input) return { error: 'invalid' };
  const { matchId, teamId, overrideReason } = input;

  const supabase = await createClient();
  const { data: match } = await supabase
    .from('match')
    .select('season_id, status, home_team_id, away_team_id, imported, season:season_id (settings)')
    .eq('id', matchId)
    .maybeSingle();
  if (!match?.season || !match.home_team_id || !match.away_team_id) return { error: 'invalid' };
  if (!lineupEditable(match.status)) return { error: 'locked' };
  const side: Side | null = teamId === match.home_team_id ? 'home' : teamId === match.away_team_id ? 'away' : null;
  if (!side) return { error: 'invalid' };

  const [attendanceResult, slotsResult] = await Promise.all([
    supabase
      .from('match_attendance')
      .select('team_id, season_player:season_player_id (id, rank)')
      .eq('match_id', matchId),
    supabase
      .from('match_slot')
      .select('slot_no, slot_type, home_p1, home_p2, away_p1, away_p2')
      .eq('match_id', matchId)
      .order('slot_no'),
  ]);
  if (attendanceResult.error || slotsResult.error) return { error: 'failed' };

  // The form must cover exactly the match's slots.
  const picks = new Map(input.slots.map((s) => [s.slot_no, s]));
  if (picks.size !== slotsResult.data.length || slotsResult.data.some((s) => !picks.has(s.slot_no))) {
    return { error: 'invalid' };
  }

  // A form could be tampered with: an override may accept an absent player, never one from another
  // team or season.
  const picked = [...new Set(input.slots.flatMap((s) => [s.p1, s.p2]).filter((id) => id !== null))];
  if (picked.length > 0) {
    const { data: players, error } = await supabase
      .from('season_player')
      .select('id')
      .in('id', picked)
      .eq('season_id', match.season_id)
      .eq('team_id', teamId);
    if (error) return { error: 'failed' };
    if (players.length !== picked.length) return { error: 'invalid' };
  }

  const presentOf = (team: string) =>
    attendanceResult.data.flatMap((row) =>
      row.team_id === team && row.season_player ? [{ id: row.season_player.id, rank: row.season_player.rank }] : [],
    );
  const attendance: LineupAttendance = { home: presentOf(match.home_team_id), away: presentOf(match.away_team_id) };
  const slots = slotsResult.data.map((slot) => {
    const pick = picks.get(slot.slot_no)!;
    return { ...slot, [`${side}_p1`]: pick.p1, [`${side}_p2`]: pick.p2 };
  });
  const parsedSettings = parseSeasonSettings(match.season.settings);
  const settings = parsedSettings.ok ? parsedSettings.settings : DEFAULT_SEASON_SETTINGS;
  const violations = validateLineup({ imported: match.imported }, side, attendance, slots, settings);

  if (violations.length > 0) {
    if (viewer.role !== 'btc' || !overridable(violations)) return { error: 'violations' };
    if (!overrideReason) return { error: 'reason' };
  }

  const { error } = await supabase.rpc('save_lineup', {
    p_match_id: matchId,
    p_team_id: teamId,
    p_slots: input.slots,
    p_override_codes: [...new Set(violations.map((v) => v.code))],
    p_override_reason: violations.length > 0 ? overrideReason : '',
  });
  if (error) return { error: error.code === 'P0001' ? 'locked' : error.code === '42501' ? 'violations' : 'failed' };

  refresh();
  return { ok: true };
}
