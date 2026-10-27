import { isUuid } from './auth/users';

export type NewSeasonInput = {
  year: number;
  name: string;
  venue: string;
  /** Season to clone, or `null` to start from the default rules. */
  sourceId: string | null;
};

export type NewSeasonError = 'year' | 'name' | 'venue' | 'source';

export const MIN_SEASON_YEAR = 2000;
export const MAX_SEASON_YEAR = 2100;
export const MAX_SEASON_NAME_LENGTH = 80;
export const MAX_SEASON_VENUE_LENGTH = 120;

function text(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === 'string' ? value : '';
}

/** Validates the "create season" form. A blank name becomes `ABT {year}`. */
export function parseNewSeason(
  formData: FormData,
): { ok: true; value: NewSeasonInput } | { ok: false; error: NewSeasonError } {
  const yearText = text(formData, 'year').trim();
  const year = /^\d{4}$/.test(yearText) ? Number(yearText) : NaN;
  if (!Number.isInteger(year) || year < MIN_SEASON_YEAR || year > MAX_SEASON_YEAR) return { ok: false, error: 'year' };

  const name = text(formData, 'name').trim() || `ABT ${year}`;
  if (name.length > MAX_SEASON_NAME_LENGTH) return { ok: false, error: 'name' };

  const venue = text(formData, 'venue').trim();
  if (venue.length > MAX_SEASON_VENUE_LENGTH) return { ok: false, error: 'venue' };

  const source = text(formData, 'source');
  if (source !== '' && !isUuid(source)) return { ok: false, error: 'source' };

  return { ok: true, value: { year, name, venue, sourceId: source || null } };
}

export type SeasonDetailsInput = { name: string; venue: string; matchDays: string[] };

export type SeasonDetailsError = 'name' | 'venue';

/** A real calendar date written as `YYYY-MM-DD`. */
function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

/**
 * Validates the season details form. Match days come as repeated `matchDays` fields; blanks and
 * invalid dates are dropped, and the rest are de-duplicated and sorted.
 */
export function parseSeasonDetails(
  formData: FormData,
): { ok: true; value: SeasonDetailsInput } | { ok: false; error: SeasonDetailsError } {
  const name = text(formData, 'name').trim();
  if (!name || name.length > MAX_SEASON_NAME_LENGTH) return { ok: false, error: 'name' };

  const venue = text(formData, 'venue').trim();
  if (venue.length > MAX_SEASON_VENUE_LENGTH) return { ok: false, error: 'venue' };

  const days = formData
    .getAll('matchDays')
    .map((d) => (typeof d === 'string' ? d.trim() : ''))
    .filter(isIsoDate);
  const matchDays = [...new Set(days)].sort();

  return { ok: true, value: { name, venue, matchDays } };
}

export const MAX_COURT_NAME_LENGTH = 40;

/** A court name: trimmed, non-empty, at most {@link MAX_COURT_NAME_LENGTH} characters; otherwise `null`. */
export function parseCourtName(value: string): string | null {
  const name = value.trim();
  return name && name.length <= MAX_COURT_NAME_LENGTH ? name : null;
}

export type CourtOrder = { id: string; sort_order: number };

/**
 * Moves a court one place up or down in `courts` (already in display order) and renumbers every
 * court 1..n. A court at the edge, or one that is not in the list, keeps its place.
 */
export function moveCourt(courts: { id: string }[], id: string, direction: 'up' | 'down'): CourtOrder[] {
  const ids = courts.map((c) => c.id);
  const from = ids.indexOf(id);
  const to = direction === 'up' ? from - 1 : from + 1;
  if (from !== -1 && to >= 0 && to < ids.length) [ids[from], ids[to]] = [ids[to], ids[from]];
  return ids.map((courtId, i) => ({ id: courtId, sort_order: i + 1 }));
}
