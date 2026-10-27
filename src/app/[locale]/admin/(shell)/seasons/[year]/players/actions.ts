'use server';

import { refresh } from 'next/cache';

import { DEFAULT_SEASON_SETTINGS, parseSeasonSettings } from '@/domain/settings';
import { requireBtc } from '@/lib/auth/session';
import { isUuid } from '@/lib/auth/users';
import { parsePlayerEdit, type PlayerEditError } from '@/lib/season-players';
import { createClient } from '@/lib/supabase/server';

export type PlayerEditState = { ok: true } | { ok: false; errors: PlayerEditError[] } | { error: 'failed' } | undefined;

export type PlayerActionState = { ok: true } | { error: 'failed' } | undefined;

type Supabase = Awaited<ReturnType<typeof createClient>>;

/** Re-reads the season player from the DB: the form could be stale or tampered with. */
async function findSeasonPlayer(supabase: Supabase, seasonPlayerId: string, seasonId: string) {
  const { data } = await supabase
    .from('season_player')
    .select('id, person_id')
    .eq('id', seasonPlayerId)
    .eq('season_id', seasonId)
    .maybeSingle();
  return data;
}

export async function updateSeasonPlayer(_prev: PlayerEditState, formData: FormData): Promise<PlayerEditState> {
  await requireBtc();
  const seasonId = String(formData.get('seasonId') ?? '');
  const seasonPlayerId = String(formData.get('seasonPlayerId') ?? '');
  if (!isUuid(seasonId) || !isUuid(seasonPlayerId)) return { error: 'failed' };

  // The user session, not the service role: RLS lets the BTC write and nobody else.
  const supabase = await createClient();
  const { data: season } = await supabase.from('season').select('settings').eq('id', seasonId).maybeSingle();
  if (!season) return { error: 'failed' };
  const settings = parseSeasonSettings(season.settings);
  const maxRank = (settings.ok ? settings.settings : DEFAULT_SEASON_SETTINGS).max_rank;

  const parsed = parsePlayerEdit(formData, { maxRank });
  if (!parsed.ok) return parsed;
  const { fullName, gender, rank, skillPoints, teamId, memberType, feeAmount } = parsed.value;

  const player = await findSeasonPlayer(supabase, seasonPlayerId, seasonId);
  if (!player) return { error: 'failed' };

  if (teamId) {
    const { data: team } = await supabase
      .from('team')
      .select('id')
      .eq('id', teamId)
      .eq('season_id', seasonId)
      .maybeSingle();
    if (!team) return { ok: false, errors: ['team'] };
  }

  // The slug stays as it is: it is the public URL key of the person.
  const { error: personError } = await supabase
    .from('person')
    .update({ full_name: fullName, gender })
    .eq('id', player.person_id);
  if (personError) return { error: 'failed' };

  const { error: playerError } = await supabase
    .from('season_player')
    .update({ rank, skill_points: skillPoints, team_id: teamId })
    .eq('id', player.id);
  if (playerError) return { error: 'failed' };

  const { error: privateError } = await supabase
    .from('season_player_private')
    .upsert(
      { season_player_id: player.id, member_type: memberType, fee_amount: feeAmount },
      { onConflict: 'season_player_id' },
    );
  if (privateError) return { error: 'failed' };

  refresh();
  return { ok: true };
}

export async function setPlayerFeePaid(_prev: PlayerActionState, formData: FormData): Promise<PlayerActionState> {
  await requireBtc();
  const seasonId = String(formData.get('seasonId') ?? '');
  const seasonPlayerId = String(formData.get('seasonPlayerId') ?? '');
  const paid = formData.get('paid');
  if (!isUuid(seasonId) || !isUuid(seasonPlayerId) || (paid !== 'true' && paid !== 'false')) {
    return { error: 'failed' };
  }

  const supabase = await createClient();
  const player = await findSeasonPlayer(supabase, seasonPlayerId, seasonId);
  if (!player) return { error: 'failed' };

  // Only an existing private row can be marked: the member type and fee come from the edit form.
  const { data, error } = await supabase
    .from('season_player_private')
    .update({ fee_paid_at: paid === 'true' ? new Date().toISOString() : null })
    .eq('season_player_id', player.id)
    .select('id');
  if (error || data.length === 0) return { error: 'failed' };

  refresh();
  return { ok: true };
}

export async function setPlayerStatus(_prev: PlayerActionState, formData: FormData): Promise<PlayerActionState> {
  await requireBtc();
  const seasonId = String(formData.get('seasonId') ?? '');
  const seasonPlayerId = String(formData.get('seasonPlayerId') ?? '');
  const status = formData.get('status');
  if (!isUuid(seasonId) || !isUuid(seasonPlayerId) || (status !== 'active' && status !== 'withdrawn')) {
    return { error: 'failed' };
  }

  const supabase = await createClient();
  const player = await findSeasonPlayer(supabase, seasonPlayerId, seasonId);
  if (!player) return { error: 'failed' };

  const { error } = await supabase.from('season_player').update({ status }).eq('id', player.id);
  if (error) return { error: 'failed' };

  refresh();
  return { ok: true };
}
