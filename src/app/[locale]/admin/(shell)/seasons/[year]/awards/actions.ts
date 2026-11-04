'use server';

import { getLocale } from 'next-intl/server';

import { redirect } from '@/i18n/navigation';
import { parseAwardForm, parseWinnerForm, type AwardFieldError, type WinnerError } from '@/lib/award-admin';
import { loadWinnerContext } from '@/lib/award-admin-db';
import { requireBtc } from '@/lib/auth/session';
import { isUuid } from '@/lib/auth/users';
import { invalidatePublicData } from '@/lib/public-cache';
import { createClient } from '@/lib/supabase/server';

/** The award form as typed, so a failed save can refill it (React resets the form after an action). */
export type AwardFormFields = Record<
  'nameVi' | 'nameEn' | 'criteriaVi' | 'criteriaEn' | 'sponsor' | 'value' | 'note',
  string
>;

export type SaveAwardState = { ok: true } | { error: AwardFieldError | 'failed'; fields: AwardFormFields } | undefined;
export type AwardActionState = { ok: true } | { error: 'failed' } | undefined;
export type AddWinnerState = { ok: true } | { error: WinnerError | 'failed' } | undefined;
export type ReorderAwardsState = { ok: true } | { error: 'changed' | 'failed' };

const FIELD_NAMES = ['nameVi', 'nameEn', 'criteriaVi', 'criteriaEn', 'sponsor', 'value', 'note'] as const;

function awardsPath(year: number) {
  return `/admin/seasons/${year}/awards`;
}

/**
 * Creates an award at the end of the list, or updates one (spec §6 A7). A new award opens in the form,
 * so its winners can be added next.
 */
export async function saveAward(_prev: SaveAwardState, formData: FormData): Promise<SaveAwardState> {
  await requireBtc();
  const fields = Object.fromEntries(
    FIELD_NAMES.map((name) => [name, String(formData.get(name) ?? '')]),
  ) as AwardFormFields;
  const seasonId = String(formData.get('seasonId') ?? '');
  const awardId = String(formData.get('awardId') ?? '');
  const year = Number(formData.get('year'));
  if (!isUuid(seasonId) || (awardId !== '' && !isUuid(awardId)) || !Number.isInteger(year)) {
    return { error: 'failed', fields };
  }
  const parsed = parseAwardForm(formData);
  if (!parsed.ok) return { error: parsed.error, fields };

  const supabase = await createClient();
  if (awardId) {
    const { error } = await supabase.from('award').update(parsed.value).eq('id', awardId).eq('season_id', seasonId);
    if (error) return { error: 'failed', fields };
    invalidatePublicData();
    return { ok: true };
  }

  const last = await supabase
    .from('award')
    .select('sort_order')
    .eq('season_id', seasonId)
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (last.error) return { error: 'failed', fields };
  const { data, error } = await supabase
    .from('award')
    .insert({ ...parsed.value, season_id: seasonId, sort_order: (last.data?.sort_order ?? 0) + 1 })
    .select('id')
    .single();
  if (error) return { error: 'failed', fields };

  invalidatePublicData();
  return redirect({ href: `${awardsPath(year)}?award=${data.id}`, locale: await getLocale() });
}

/** Deletes an award with its winners, after the form's confirmation. */
export async function deleteAward(_prev: AwardActionState, formData: FormData): Promise<AwardActionState> {
  await requireBtc();
  const awardId = String(formData.get('awardId') ?? '');
  const year = Number(formData.get('year'));
  if (!isUuid(awardId) || !Number.isInteger(year)) return { error: 'failed' };

  const supabase = await createClient();
  const { error } = await supabase.rpc('delete_award', { p_award_id: awardId });
  if (error) return { error: 'failed' };

  invalidatePublicData();
  return redirect({ href: awardsPath(year), locale: await getLocale() });
}

/**
 * Adds a winner: a player, a pair or a team, with an optional related match (spec §6 A7). Checked here
 * against the season, then again by `add_award_winner`.
 */
export async function addAwardWinner(_prev: AddWinnerState, formData: FormData): Promise<AddWinnerState> {
  await requireBtc();
  const awardId = String(formData.get('awardId') ?? '');
  if (!isUuid(awardId)) return { error: 'failed' };

  const supabase = await createClient();
  const award = await supabase.from('award').select('season_id').eq('id', awardId).maybeSingle();
  if (award.error || !award.data) return { error: 'failed' };
  const parsed = parseWinnerForm(formData, await loadWinnerContext(supabase, award.data.season_id));
  if (!parsed.ok) return { error: parsed.error };

  const { kind, teamId, members, matchId, note } = parsed.value;
  const { error } = await supabase.rpc('add_award_winner', {
    p_award_id: awardId,
    p_kind: kind,
    p_team_id: teamId ?? undefined,
    p_members: members,
    p_match_id: matchId ?? undefined,
    p_note: note ?? undefined,
  });
  if (error) return { error: 'failed' };

  invalidatePublicData();
  return { ok: true };
}

export async function removeAwardWinner(_prev: AwardActionState, formData: FormData): Promise<AwardActionState> {
  await requireBtc();
  const winnerId = String(formData.get('winnerId') ?? '');
  if (!isUuid(winnerId)) return { error: 'failed' };

  const supabase = await createClient();
  const { error } = await supabase.rpc('delete_award_winner', { p_winner_id: winnerId });
  if (error) return { error: 'failed' };

  invalidatePublicData();
  return { ok: true };
}

/** Saves the list order: every award of the season, first one first. */
export async function reorderAwards(seasonId: string, awardIds: string[]): Promise<ReorderAwardsState> {
  await requireBtc();
  if (!isUuid(seasonId) || !awardIds.every(isUuid)) return { error: 'failed' };

  const supabase = await createClient();
  const { error } = await supabase.rpc('reorder_awards', { p_season_id: seasonId, p_award_ids: awardIds });
  if (error) return { error: error.code === '40001' ? 'changed' : 'failed' };

  invalidatePublicData();
  return { ok: true };
}
