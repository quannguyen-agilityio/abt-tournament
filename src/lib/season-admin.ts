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
