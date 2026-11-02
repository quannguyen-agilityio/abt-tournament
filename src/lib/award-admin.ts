import { isUuid } from './auth/users';
import type { AwardWinnerKind } from './public-awards';

export const MAX_AWARD_NAME_LENGTH = 120;
export const MAX_AWARD_CRITERIA_LENGTH = 500;
export const MAX_AWARD_SPONSOR_LENGTH = 120;
export const MAX_AWARD_NOTE_LENGTH = 500;
export const MAX_AWARD_VALUE_VND = 2_000_000_000;

export const AWARD_WINNER_KINDS: readonly AwardWinnerKind[] = ['player', 'pair', 'team'];

/** An `award` row's editable fields, as written to the database. Blank optional text is null. */
export type AwardFields = {
  name_vi: string;
  name_en: string | null;
  criteria_vi: string;
  criteria_en: string | null;
  sponsor: string | null;
  value_vnd: number | null;
  note: string | null;
};

export type AwardFieldError = 'name' | 'value' | 'tooLong';

function text(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * A prize in VND, as typed: digits with optional spaces, dots or commas as thousands separators
 * (`1.000.000`). Blank is no value. Returns NaN for anything else.
 */
export function parseValueVnd(raw: string): number | null {
  const compact = raw.trim().replace(/[\s.,]/g, '');
  if (compact === '') return null;
  return /^\d+$/.test(compact) ? Number(compact) : NaN;
}

/**
 * Validates the award form (spec §6 A7). The VI name is required; the `_en` fields are optional and
 * fall back to VI on the public page (spec §7).
 */
export function parseAwardForm(
  formData: FormData,
): { ok: true; value: AwardFields } | { ok: false; error: AwardFieldError } {
  const nameVi = text(formData, 'nameVi');
  if (nameVi === '') return { ok: false, error: 'name' };

  const value = parseValueVnd(text(formData, 'value'));
  if (value !== null && (!Number.isSafeInteger(value) || value > MAX_AWARD_VALUE_VND))
    return { ok: false, error: 'value' };

  const fields: AwardFields = {
    name_vi: nameVi,
    name_en: text(formData, 'nameEn') || null,
    criteria_vi: text(formData, 'criteriaVi'),
    criteria_en: text(formData, 'criteriaEn') || null,
    sponsor: text(formData, 'sponsor') || null,
    value_vnd: value,
    note: text(formData, 'note') || null,
  };
  const limits: [string | null, number][] = [
    [fields.name_vi, MAX_AWARD_NAME_LENGTH],
    [fields.name_en, MAX_AWARD_NAME_LENGTH],
    [fields.criteria_vi, MAX_AWARD_CRITERIA_LENGTH],
    [fields.criteria_en, MAX_AWARD_CRITERIA_LENGTH],
    [fields.sponsor, MAX_AWARD_SPONSOR_LENGTH],
    [fields.note, MAX_AWARD_NOTE_LENGTH],
  ];
  if (limits.some(([v, max]) => (v?.length ?? 0) > max)) return { ok: false, error: 'tooLong' };

  return { ok: true, value: fields };
}

/** A new winner as the form sends it. `members` is empty for a team; `teamId` is null otherwise. */
export type WinnerInput = {
  kind: AwardWinnerKind;
  teamId: string | null;
  members: string[];
  matchId: string | null;
  note: string | null;
};

export type WinnerError = 'kind' | 'members' | 'sameTeam' | 'team' | 'match' | 'tooLong';

/** What a winner is checked against: the season's players (with their team), teams and matches. */
export type WinnerContext = {
  players: ReadonlyMap<string, string | null>;
  teamIds: ReadonlySet<string>;
  matches: readonly { id: string; home_team_id: string | null; away_team_id: string | null }[];
};

const MEMBER_COUNT: Record<AwardWinnerKind, number> = { player: 1, pair: 2, team: 0 };

/**
 * Reads and checks a winner (spec §3.1 `award_winner`): 1 player or 2 different players on one team,
 * or a team; the related match, when given, is one the winner's team played. The same rules as
 * `add_award_winner`, which has the final say and sets the team of a player or pair itself.
 */
export function parseWinnerForm(
  formData: FormData,
  context: WinnerContext,
): { ok: true; value: WinnerInput } | { ok: false; error: WinnerError } {
  const kind = text(formData, 'kind') as AwardWinnerKind;
  if (!AWARD_WINNER_KINDS.includes(kind)) return { ok: false, error: 'kind' };

  const members = formData
    .getAll('member')
    .map((v) => (typeof v === 'string' ? v.trim() : ''))
    .filter((v) => v !== '');
  if (
    members.length !== MEMBER_COUNT[kind] ||
    new Set(members).size !== members.length ||
    !members.every((id) => isUuid(id) && context.players.has(id))
  ) {
    return { ok: false, error: 'members' };
  }

  let teamId: string | null;
  if (kind === 'team') {
    teamId = text(formData, 'team');
    if (!context.teamIds.has(teamId)) return { ok: false, error: 'team' };
  } else {
    const teams = new Set(members.map((id) => context.players.get(id) ?? null));
    if (teams.size !== 1) return { ok: false, error: 'sameTeam' };
    [teamId] = teams;
  }

  const matchId = text(formData, 'match') || null;
  if (matchId !== null) {
    const match = context.matches.find((m) => m.id === matchId);
    if (!match || (teamId !== null && match.home_team_id !== teamId && match.away_team_id !== teamId)) {
      return { ok: false, error: 'match' };
    }
  }

  const note = text(formData, 'note') || null;
  if ((note?.length ?? 0) > MAX_AWARD_NOTE_LENGTH) return { ok: false, error: 'tooLong' };

  return { ok: true, value: { kind, teamId: kind === 'team' ? teamId : null, members, matchId, note } };
}

/** Moves the item at `from` to `to`, for the reorderable award list. */
export function moveItem<T>(list: readonly T[], from: number, to: number): T[] {
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}
