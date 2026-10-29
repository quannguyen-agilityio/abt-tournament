'use server';

import { refresh } from 'next/cache';

import { effectivePair, validateLineup, type LineupAttendance, type LineupRuleCode, type Side } from '@/domain/lineup';
import { DEFAULT_SEASON_SETTINGS, parseSeasonSettings } from '@/domain/settings';
import { requireStaff } from '@/lib/auth/session';
import { isUuid } from '@/lib/auth/users';
import { attendanceEditable, parseAttendanceForm } from '@/lib/match-attendance';
import { lineupEditable, lockSnapshot, overridable, parseLineupForm, unresolvedViolations } from '@/lib/match-lineup';
import {
  matchOutcome,
  parseScoreForm,
  scoresEditable,
  scoreState,
  slotScoreViolations,
  scoreRules,
  withScore,
} from '@/lib/match-scores';
import {
  addedViolations,
  parseSubstitutionForm,
  substitutionHandicap,
  substitutionsOpen,
  substitutionState,
} from '@/lib/match-substitution';
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

/** A match with both teams, how it is scored, its season settings and the scores and start points of its slots. */
async function loadScoreMatch(supabase: Supabase, matchId: string) {
  const [matchResult, slotsResult] = await Promise.all([
    supabase
      .from('match')
      .select(
        'stage, status, home_team_id, away_team_id, relay_handicap_home, relay_handicap_away, season:season_id (settings)',
      )
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
    teams: { home: match.home_team_id, away: match.away_team_id },
    rules: scoreRules(match),
    settings: parsedSettings.ok ? parsedSettings.settings : DEFAULT_SEASON_SETTINGS,
    slots: slotsResult.data,
  };
}

export type ScoreState = { ok: true } | { error: 'closed' | 'invalid' | 'violations' | 'changed' | 'failed' };

/**
 * Saves one set's score, or one relay leg's cumulative score, on its own (A5 step 4), so a weak connection loses at most this row. The score
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
  const { match, rules, settings, slots } = loaded;
  if (!scoresEditable(match.status)) return { error: 'closed' };
  if (!slots.some((s) => s.slot_no === slotNo)) return { error: 'invalid' };
  if (slotScoreViolations(rules, withScore(slots, slotNo, score), slotNo, settings).length > 0) {
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

export type CompleteState = { error: 'notReady' | 'closed' | 'invalid' | 'changed' | 'failed' } | undefined;

/**
 * Completes a match (A5 step 5): derives the winner from the saved scores (spec §4.4) and stores it.
 * From then on only the BTC can change the match, by reopening it.
 */
export async function completeMatch(_prev: CompleteState, formData: FormData): Promise<CompleteState> {
  await requireStaff();
  const matchId = String(formData.get('matchId') ?? '');
  if (!isUuid(matchId)) return { error: 'invalid' };

  const supabase = await createClient();
  const loaded = await loadScoreMatch(supabase, matchId).catch(() => undefined);
  if (loaded === undefined) return { error: 'failed' };
  if (!loaded) return { error: 'invalid' };
  const { match, teams, rules, settings, slots } = loaded;
  if (match.status !== 'in_progress') return { error: 'closed' };
  const { winner } = matchOutcome(rules, slots, settings);
  if (!winner) return { error: 'notReady' };

  const { error } = await supabase.rpc('complete_match', {
    p_match_id: matchId,
    p_winner_team_id: teams[winner],
    p_expected: scoreState(slots),
  });
  if (error) return { error: error.code === 'P0001' ? 'closed' : error.code === '40001' ? 'changed' : 'failed' };

  refresh();
  return undefined;
}

export type ReopenState = { error: 'notCompleted' | 'invalid' | 'failed' } | undefined;

/** BTC only: moves a completed match back to score entry and clears the winner. The audit log records it. */
export async function reopenMatch(_prev: ReopenState, formData: FormData): Promise<ReopenState> {
  const viewer = await requireStaff();
  const matchId = String(formData.get('matchId') ?? '');
  if (viewer.role !== 'btc' || !isUuid(matchId)) return { error: 'invalid' };

  const supabase = await createClient();
  const { error } = await supabase.rpc('reopen_match', { p_match_id: matchId });
  if (error) return { error: error.code === 'P0001' ? 'notCompleted' : 'failed' };

  refresh();
  return undefined;
}

/**
 * A match with both teams, its season settings, the present players of each side, the skills of every
 * player of both teams and its slots with their scores, start points and substitutions.
 */
async function loadSubstitutionMatch(supabase: Supabase, matchId: string) {
  const [matchResult, attendanceResult, slotsResult] = await Promise.all([
    supabase
      .from('match')
      .select(
        'season_id, stage, status, imported, home_team_id, away_team_id, relay_handicap_home, relay_handicap_away, season:season_id (settings)',
      )
      .eq('id', matchId)
      .maybeSingle(),
    supabase
      .from('match_attendance')
      .select('team_id, season_player:season_player_id (id, rank)')
      .eq('match_id', matchId),
    supabase
      .from('match_slot')
      .select(
        'slot_no, slot_type, home_p1, home_p2, away_p1, away_p2, score_home, score_away, handicap_home, handicap_away, slot_substitution (id, side, replaced_id, substitute_id, created_at)',
      )
      .eq('match_id', matchId)
      .order('slot_no'),
  ]);
  if (matchResult.error) throw matchResult.error;
  if (attendanceResult.error) throw attendanceResult.error;
  if (slotsResult.error) throw slotsResult.error;
  const match = matchResult.data;
  if (!match?.season || !match.home_team_id || !match.away_team_id) return null;
  const teams = { home: match.home_team_id, away: match.away_team_id };

  const playersResult = await supabase
    .from('season_player')
    .select('id, team_id, skill_points, status')
    .eq('season_id', match.season_id)
    .in('team_id', [teams.home, teams.away]);
  if (playersResult.error) throw playersResult.error;

  const present = attendanceResult.data.flatMap((row) =>
    row.season_player ? [{ ...row.season_player, teamId: row.team_id }] : [],
  );
  const presentOf = (team: string) => present.filter((p) => p.teamId === team).map(({ id, rank }) => ({ id, rank }));
  const attendance: LineupAttendance = { home: presentOf(teams.home), away: presentOf(teams.away) };
  const parsedSettings = parseSeasonSettings(match.season.settings);

  // Substitutions apply in the order they were made.
  const slots = slotsResult.data.map(({ slot_substitution, ...slot }) => ({
    ...slot,
    substitutions: [...slot_substitution].sort((a, b) => a.created_at.localeCompare(b.created_at)),
  }));

  return {
    match,
    teams,
    settings: parsedSettings.ok ? parsedSettings.settings : DEFAULT_SEASON_SETTINGS,
    attendance,
    players: playersResult.data,
    skillOf: new Map(playersResult.data.map((p) => [p.id, p.skill_points])),
    slots,
  };
}

export type SubstitutionState =
  | { ok: true }
  | { error: 'closed' | 'invalid' | 'scored' | 'violations' | 'reason' | 'changed' | 'failed' }
  | undefined;

/**
 * Substitutes one player of a set or leg that is not scored yet (spec §4.1). The rank rule and the
 * other lineup rules are checked again here on the effective players: a referee cannot make a
 * substitution that adds violations, the BTC can with a reason, which records one `lineup_override`
 * per broken rule. The handicap is recomputed (D18).
 */
export async function substitutePlayer(_prev: SubstitutionState, formData: FormData): Promise<SubstitutionState> {
  const viewer = await requireStaff();
  const input = parseSubstitutionForm(formData);
  if (!input) return { error: 'invalid' };
  const { matchId, teamId, slotNo, replacedId, substituteId, reason, overrideReason } = input;

  const supabase = await createClient();
  const [loaded, overrides] = await Promise.all([
    loadSubstitutionMatch(supabase, matchId).catch(() => undefined),
    supabase.rpc('lineup_override_codes', { p_match_id: matchId }),
  ]);
  if (loaded === undefined || overrides.error) return { error: 'failed' };
  if (!loaded) return { error: 'invalid' };
  const { match, teams, settings, attendance, players, skillOf, slots } = loaded;
  if (!substitutionsOpen(match.status)) return { error: 'closed' };
  const side: Side | null = teamId === teams.home ? 'home' : teamId === teams.away ? 'away' : null;
  if (!side) return { error: 'invalid' };

  const slot = slots.find((s) => s.slot_no === slotNo);
  if (!slot) return { error: 'invalid' };
  if (slot.score_home !== null || slot.score_away !== null) return { error: 'scored' };
  const pair = effectivePair(slot, side);
  if (!pair.includes(replacedId) || pair.includes(substituteId)) return { error: 'invalid' };
  // A form could be tampered with: an override may accept an absent player, never one from another
  // team or season.
  if (!players.some((p) => p.id === substituteId && p.team_id === teamId && p.status === 'active')) {
    return { error: 'invalid' };
  }

  const toLineup = (substituted: boolean) =>
    slots.map((s) => ({
      ...s,
      substitutions: [
        ...s.substitutions,
        ...(substituted && s.slot_no === slotNo
          ? [{ side, replaced_id: replacedId, substitute_id: substituteId }]
          : []),
      ],
    }));
  const before = toLineup(false);
  const after = toLineup(true);
  const overridden = new Set<LineupRuleCode>(
    overrides.data.filter((o) => o.team_id === teamId).map((o) => o.rule_code),
  );
  const added = unresolvedViolations(
    addedViolations(
      validateLineup({ imported: match.imported }, side, attendance, before, settings),
      validateLineup({ imported: match.imported }, side, attendance, after, settings),
    ),
    overridden,
  );
  if (added.length > 0) {
    if (viewer.role !== 'btc' || !overridable(added)) return { error: 'violations' };
    if (!overrideReason) return { error: 'reason' };
  }

  const handicap = substitutionHandicap(
    match.stage,
    after.map((s) => ({
      slotNo: s.slot_no,
      slotType: s.slot_type,
      home: effectivePair(s, 'home'),
      away: effectivePair(s, 'away'),
      scored: s.score_home !== null || s.score_away !== null,
    })),
    slotNo,
    skillOf,
    settings,
    match.relay_handicap_home !== null && match.relay_handicap_away !== null
      ? { home: match.relay_handicap_home, away: match.relay_handicap_away }
      : null,
  );
  if (!handicap) return { error: 'invalid' };

  const { error } = await supabase.rpc('substitute_player', {
    p_match_id: matchId,
    p_slot_no: slotNo,
    p_side: side,
    p_replaced_id: replacedId,
    p_substitute_id: substituteId,
    p_reason: reason,
    p_expected: substitutionState(
      slots,
      slots.flatMap((s) => s.substitutions.map((sub) => sub.id)),
    ),
    p_handicap_home: handicap.kind === 'group' ? handicap.slot.home : undefined,
    p_handicap_away: handicap.kind === 'group' ? handicap.slot.away : undefined,
    p_relay_home: handicap.kind === 'relay' ? handicap.start.home : undefined,
    p_relay_away: handicap.kind === 'relay' ? handicap.start.away : undefined,
    p_override_codes: [...new Set(added.map((v) => v.code))],
    p_override_reason: added.length > 0 ? overrideReason : '',
  });
  if (error) {
    const code = error.code;
    return {
      error:
        code === 'P0001'
          ? 'closed'
          : code === '22023'
            ? 'scored'
            : code === '40001'
              ? 'changed'
              : code === '42501'
                ? 'violations'
                : 'failed',
    };
  }

  refresh();
  return { ok: true };
}
