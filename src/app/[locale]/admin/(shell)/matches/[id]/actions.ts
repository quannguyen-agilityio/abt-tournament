'use server';

import { refresh } from 'next/cache';

import { validateLineup, type LineupAttendance, type LineupRuleCode, type Side } from '@/domain/lineup';
import { DEFAULT_SEASON_SETTINGS, parseSeasonSettings } from '@/domain/settings';
import { requireStaff } from '@/lib/auth/session';
import { isUuid } from '@/lib/auth/users';
import { attendanceEditable, parseAttendanceForm } from '@/lib/match-attendance';
import { lineupEditable, lockSnapshot, overridable, parseLineupForm, unresolvedViolations } from '@/lib/match-lineup';
import { parseScoreForm, scoresEditable, scoreState, slotScoreViolations, withScore } from '@/lib/match-scores';
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

type Supabase = Awaited<ReturnType<typeof createClient>>;

/** A match with both teams, its season settings, the present players of each side and its slots. */
async function loadLineupMatch(supabase: Supabase, matchId: string) {
  const { data: match } = await supabase
    .from('match')
    .select('season_id, stage, status, home_team_id, away_team_id, imported, season:season_id (settings)')
    .eq('id', matchId)
    .maybeSingle();
  if (!match?.season || !match.home_team_id || !match.away_team_id) return null;
  const teams = { home: match.home_team_id, away: match.away_team_id };

  const [attendanceResult, slotsResult] = await Promise.all([
    supabase
      .from('match_attendance')
      .select('team_id, season_player:season_player_id (id, rank, skill_points)')
      .eq('match_id', matchId),
    supabase
      .from('match_slot')
      .select('slot_no, slot_type, home_p1, home_p2, away_p1, away_p2')
      .eq('match_id', matchId)
      .order('slot_no'),
  ]);
  if (attendanceResult.error) throw attendanceResult.error;
  if (slotsResult.error) throw slotsResult.error;

  const present = attendanceResult.data.flatMap((row) =>
    row.season_player ? [{ ...row.season_player, teamId: row.team_id }] : [],
  );
  const presentOf = (team: string) => present.filter((p) => p.teamId === team).map(({ id, rank }) => ({ id, rank }));
  const attendance: LineupAttendance = { home: presentOf(teams.home), away: presentOf(teams.away) };
  const parsedSettings = parseSeasonSettings(match.season.settings);

  return {
    match,
    teams,
    settings: parsedSettings.ok ? parsedSettings.settings : DEFAULT_SEASON_SETTINGS,
    attendance,
    skillOf: new Map(present.map((p) => [p.id, p.skill_points])),
    slots: slotsResult.data,
  };
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
  const loaded = await loadLineupMatch(supabase, matchId).catch(() => undefined);
  if (loaded === undefined) return { error: 'failed' };
  if (!loaded) return { error: 'invalid' };
  const { match, teams, settings, attendance } = loaded;
  if (!lineupEditable(match.status)) return { error: 'locked' };
  const side: Side | null = teamId === teams.home ? 'home' : teamId === teams.away ? 'away' : null;
  if (!side) return { error: 'invalid' };

  // The form must cover exactly the match's slots.
  const picks = new Map(input.slots.map((s) => [s.slot_no, s]));
  if (picks.size !== loaded.slots.length || loaded.slots.some((s) => !picks.has(s.slot_no))) {
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

  const slots = loaded.slots.map((slot) => {
    const pick = picks.get(slot.slot_no)!;
    return { ...slot, [`${side}_p1`]: pick.p1, [`${side}_p2`]: pick.p2 };
  });
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

export type LockState =
  { error: 'locked' | 'invalid' | 'violations' | 'incomplete' | 'changed' | 'failed' } | undefined;

/**
 * Locks both lineups (A5 step 3): both must be valid or overridden by the BTC. Takes the handicap
 * snapshot (spec §4.2, §4.3) and moves the match to `lineup_locked`, which makes the lineups public.
 */
export async function lockLineups(_prev: LockState, formData: FormData): Promise<LockState> {
  await requireStaff();
  const matchId = String(formData.get('matchId') ?? '');
  if (!isUuid(matchId)) return { error: 'invalid' };

  const supabase = await createClient();
  const [loaded, overrides] = await Promise.all([
    loadLineupMatch(supabase, matchId).catch(() => undefined),
    supabase.rpc('lineup_override_codes', { p_match_id: matchId }),
  ]);
  if (loaded === undefined || overrides.error) return { error: 'failed' };
  if (!loaded) return { error: 'invalid' };
  const { match, teams, settings, attendance, skillOf, slots } = loaded;
  if (!lineupEditable(match.status)) return { error: 'locked' };

  const overriddenOf = (team: string) =>
    new Set<LineupRuleCode>(overrides.data.filter((o) => o.team_id === team).map((o) => o.rule_code));
  for (const side of ['home', 'away'] as const) {
    const violations = validateLineup({ imported: match.imported }, side, attendance, slots, settings);
    if (unresolvedViolations(violations, overriddenOf(teams[side])).length > 0) return { error: 'violations' };
  }

  const snapshot = lockSnapshot(
    match.stage,
    slots.map((s) => ({
      slotNo: s.slot_no,
      slotType: s.slot_type,
      home: [s.home_p1, s.home_p2],
      away: [s.away_p1, s.away_p2],
    })),
    skillOf,
    settings,
  );
  // Only an imported match, whose rules are skipped, can get here with an incomplete lineup.
  if (!snapshot) return { error: 'incomplete' };

  const { error } = await supabase.rpc('lock_match_lineups', {
    p_match_id: matchId,
    p_slots: snapshot.slots,
    p_relay_home: snapshot.relay?.home,
    p_relay_away: snapshot.relay?.away,
  });
  if (error) {
    return { error: error.code === 'P0001' ? 'locked' : error.code === '40001' ? 'changed' : 'failed' };
  }

  refresh();
  return undefined;
}

export type UnlockState = { error: 'notLocked' | 'invalid' | 'failed' } | undefined;

/** BTC only: moves a locked match back to the lineup step (spec §4.1). The audit log records it. */
export async function unlockLineups(_prev: UnlockState, formData: FormData): Promise<UnlockState> {
  const viewer = await requireStaff();
  const matchId = String(formData.get('matchId') ?? '');
  if (viewer.role !== 'btc' || !isUuid(matchId)) return { error: 'invalid' };

  const supabase = await createClient();
  const { error } = await supabase.rpc('unlock_match_lineups', { p_match_id: matchId });
  if (error) return { error: error.code === 'P0001' ? 'notLocked' : 'failed' };

  refresh();
  return undefined;
}

/** A match with its season settings and the scores and start points of its slots. */
async function loadScoreMatch(supabase: Supabase, matchId: string) {
  const [matchResult, slotsResult] = await Promise.all([
    supabase
      .from('match')
      .select('stage, status, home_team_id, away_team_id, season:season_id (settings)')
      .eq('id', matchId)
      .maybeSingle(),
    supabase
      .from('match_slot')
      .select('slot_no, score_home, score_away, handicap_home, handicap_away')
      .eq('match_id', matchId)
      .order('slot_no'),
  ]);
  if (matchResult.error) throw matchResult.error;
  if (slotsResult.error) throw slotsResult.error;
  const match = matchResult.data;
  if (!match?.season || !match.home_team_id || !match.away_team_id) return null;
  const parsedSettings = parseSeasonSettings(match.season.settings);
  return {
    match,
    settings: parsedSettings.ok ? parsedSettings.settings : DEFAULT_SEASON_SETTINGS,
    slots: slotsResult.data,
  };
}

export type ScoreState = { ok: true } | { error: 'closed' | 'invalid' | 'violations' | 'changed' | 'failed' };

/**
 * Saves one set's score on its own (A5 step 4), so a weak connection loses at most this row. The score
 * is checked again here (spec §4.4) on the slots as they are saved; the first score starts the match.
 * Called directly rather than as a form action, so the row keeps its input if the request fails.
 */
export async function saveSlotScore(formData: FormData): Promise<ScoreState> {
  await requireStaff();
  const input = parseScoreForm(formData);
  if (!input) return { error: 'invalid' };
  const { matchId, slotNo, score } = input;

  const supabase = await createClient();
  const loaded = await loadScoreMatch(supabase, matchId).catch(() => undefined);
  if (loaded === undefined) return { error: 'failed' };
  if (!loaded) return { error: 'invalid' };
  const { match, settings, slots } = loaded;
  if (!scoresEditable(match.status)) return { error: 'closed' };
  if (match.stage !== 'group' || !slots.some((s) => s.slot_no === slotNo)) return { error: 'invalid' };
  if (slotScoreViolations(withScore(slots, slotNo, score), slotNo, settings).length > 0) {
    return { error: 'violations' };
  }

  const { error } = await supabase.rpc('save_slot_score', {
    p_match_id: matchId,
    p_slot_no: slotNo,
    p_score_home: score.home,
    p_score_away: score.away,
    p_expected: scoreState(slots),
  });
  if (error) return { error: error.code === 'P0001' ? 'closed' : error.code === '40001' ? 'changed' : 'failed' };

  refresh();
  return { ok: true };
}
