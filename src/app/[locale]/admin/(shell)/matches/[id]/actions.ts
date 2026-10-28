'use server';

import { refresh } from 'next/cache';

import { requireStaff } from '@/lib/auth/session';
import { attendanceEditable, parseAttendanceForm } from '@/lib/match-attendance';
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
