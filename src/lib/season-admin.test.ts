import { describe, expect, it } from 'vitest';
import {
  MAX_COURT_NAME_LENGTH,
  MAX_SEASON_NAME_LENGTH,
  MAX_SEASON_VENUE_LENGTH,
  moveCourt,
  parseCourtName,
  parseNewSeason,
  parseSeasonDetails,
} from './season-admin';

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

describe('parseSeasonDetails', () => {
  function details(fields: Record<string, string>, days: string[] = []): FormData {
    const data = form(fields);
    for (const d of days) data.append('matchDays', d);
    return data;
  }

  it('trims text and sorts and de-duplicates match days', () => {
    expect(
      parseSeasonDetails(details({ name: ' ABT 2028 ', venue: ' Sân A ' }, ['2028-05-10', '2028-05-03', '2028-05-10'])),
    ).toEqual({ ok: true, value: { name: 'ABT 2028', venue: 'Sân A', matchDays: ['2028-05-03', '2028-05-10'] } });
  });

  it('drops blank and invalid match days', () => {
    const result = parseSeasonDetails(
      details({ name: 'ABT' }, ['', '2028-02-30', '28-05-03', 'x', '2028-13-01', '2028-02-29', '2027-02-29']),
    );
    expect(result).toEqual({ ok: true, value: { name: 'ABT', venue: '', matchDays: ['2028-02-29'] } });
  });

  it('requires a name of at most 80 characters', () => {
    expect(parseSeasonDetails(details({ name: '   ' }))).toEqual({ ok: false, error: 'name' });
    expect(parseSeasonDetails(details({}))).toEqual({ ok: false, error: 'name' });
    expect(parseSeasonDetails(details({ name: 'x'.repeat(MAX_SEASON_NAME_LENGTH + 1) }))).toEqual({
      ok: false,
      error: 'name',
    });
    expect(parseSeasonDetails(details({ name: 'x'.repeat(MAX_SEASON_NAME_LENGTH) })).ok).toBe(true);
  });

  it('limits the venue to 120 characters', () => {
    expect(parseSeasonDetails(details({ name: 'ABT', venue: 'v'.repeat(MAX_SEASON_VENUE_LENGTH + 1) }))).toEqual({
      ok: false,
      error: 'venue',
    });
  });
});

describe('parseCourtName', () => {
  it('trims and accepts up to 40 characters', () => {
    expect(parseCourtName('  Sân 1 ')).toBe('Sân 1');
    expect(parseCourtName('x'.repeat(MAX_COURT_NAME_LENGTH))).toBe('x'.repeat(MAX_COURT_NAME_LENGTH));
  });

  it('rejects blank and over-long names', () => {
    expect(parseCourtName('   ')).toBeNull();
    expect(parseCourtName('')).toBeNull();
    expect(parseCourtName('x'.repeat(MAX_COURT_NAME_LENGTH + 1))).toBeNull();
  });
});

describe('moveCourt', () => {
  const courts = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];

  it('swaps a court with its neighbour and renumbers from 1', () => {
    expect(moveCourt(courts, 'b', 'up')).toEqual([
      { id: 'b', sort_order: 1 },
      { id: 'a', sort_order: 2 },
      { id: 'c', sort_order: 3 },
    ]);
    expect(moveCourt(courts, 'b', 'down')).toEqual([
      { id: 'a', sort_order: 1 },
      { id: 'c', sort_order: 2 },
      { id: 'b', sort_order: 3 },
    ]);
  });

  it('keeps the order at the edges but still renumbers', () => {
    const gappy = [
      { id: 'a', sort_order: 0 },
      { id: 'b', sort_order: 0 },
    ];
    expect(moveCourt(gappy, 'a', 'up')).toEqual([
      { id: 'a', sort_order: 1 },
      { id: 'b', sort_order: 2 },
    ]);
    expect(moveCourt(courts, 'c', 'down').map((c) => c.id)).toEqual(['a', 'b', 'c']);
  });

  it('ignores an unknown court and does not mutate the input', () => {
    expect(moveCourt(courts, 'zzz', 'up').map((c) => c.id)).toEqual(['a', 'b', 'c']);
    expect(courts.map((c) => c.id)).toEqual(['a', 'b', 'c']);
  });

  it('handles an empty list and a single court', () => {
    expect(moveCourt([], 'a', 'up')).toEqual([]);
    expect(moveCourt([{ id: 'a' }], 'a', 'down')).toEqual([{ id: 'a', sort_order: 1 }]);
  });
});
