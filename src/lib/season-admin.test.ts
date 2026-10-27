import { describe, expect, it } from 'vitest';
import { MAX_SEASON_NAME_LENGTH, MAX_SEASON_VENUE_LENGTH, parseNewSeason } from './season-admin';

const SOURCE = '3456bbe9-8367-4339-b11c-ef62b6d7c0af';

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

describe('parseNewSeason', () => {
  it('accepts a full form and trims text', () => {
    expect(parseNewSeason(form({ year: '2028', name: '  ABT Final  ', venue: ' Sân A ', source: SOURCE }))).toEqual({
      ok: true,
      value: { year: 2028, name: 'ABT Final', venue: 'Sân A', sourceId: SOURCE },
    });
  });

  it('defaults a blank name to ABT {year} and treats a missing source as none', () => {
    expect(parseNewSeason(form({ year: '2028', name: '   ' }))).toEqual({
      ok: true,
      value: { year: 2028, name: 'ABT 2028', venue: '', sourceId: null },
    });
  });

  it.each(['', 'abc', '20.5', '1999', '2101', '-2028', '20288'])('rejects the year %j', (year) => {
    expect(parseNewSeason(form({ year }))).toEqual({ ok: false, error: 'year' });
  });

  it('accepts the year bounds', () => {
    expect(parseNewSeason(form({ year: '2000' })).ok).toBe(true);
    expect(parseNewSeason(form({ year: '2100' })).ok).toBe(true);
  });

  it('rejects a name or venue that is too long', () => {
    expect(parseNewSeason(form({ year: '2028', name: 'a'.repeat(MAX_SEASON_NAME_LENGTH + 1) }))).toEqual({
      ok: false,
      error: 'name',
    });
    expect(parseNewSeason(form({ year: '2028', name: 'a'.repeat(MAX_SEASON_NAME_LENGTH) })).ok).toBe(true);
    expect(parseNewSeason(form({ year: '2028', venue: 'a'.repeat(MAX_SEASON_VENUE_LENGTH + 1) }))).toEqual({
      ok: false,
      error: 'venue',
    });
  });

  it('rejects a source that is not a uuid', () => {
    expect(parseNewSeason(form({ year: '2028', source: 'nope' }))).toEqual({ ok: false, error: 'source' });
  });
});
