import { describe, expect, it } from 'vitest';
import { FIRST_SEASON_YEAR, listSeasons } from './seasons';

describe('listSeasons', () => {
  it('returns unique years, newest first, from the first season to the current one', () => {
    const years = listSeasons();
    expect(new Set(years).size).toBe(years.length);
    expect(years).toEqual([...years].sort((a, b) => b - a));
    expect(years.at(-1)).toBe(FIRST_SEASON_YEAR);
    expect(years).toContain(2026);
  });
});
