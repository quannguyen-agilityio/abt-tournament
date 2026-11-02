import { describe, expect, it } from 'vitest';
import { resolveCurrentYear, sortYearsDesc } from './seasons';

describe('sortYearsDesc', () => {
  it('sorts newest first and drops duplicates', () => {
    expect(sortYearsDesc([2025, 2027, 2026, 2025])).toEqual([2027, 2026, 2025]);
  });

  it('returns an empty list for no seasons', () => {
    expect(sortYearsDesc([])).toEqual([]);
  });
});

describe('resolveCurrentYear', () => {
  it('uses the season marked current', () => {
    expect(resolveCurrentYear({ year: 2025 }, new Date('2027-06-01T00:00:00Z'))).toBe(2025);
  });

  it('falls back to the calendar year when no season is current', () => {
    expect(resolveCurrentYear(null, new Date('2027-06-01T00:00:00Z'))).toBe(2027);
    expect(resolveCurrentYear(undefined, new Date('2027-06-01T00:00:00Z'))).toBe(2027);
  });
});
