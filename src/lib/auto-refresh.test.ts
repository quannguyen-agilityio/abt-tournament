import { describe, expect, it } from 'vitest';
import { isMatchDay } from './auto-refresh';

const DAYS = ['2027-01-09', '2027-01-16'];
const TZ = 'Asia/Ho_Chi_Minh';

describe('isMatchDay', () => {
  it('is true during a match day in the season timezone', () => {
    expect(isMatchDay(DAYS, new Date('2027-01-09T01:00:00Z'), TZ)).toBe(true);
  });

  it('uses the venue day, not the UTC day', () => {
    // 23:30 UTC on the 8th is 06:30 ICT on the 9th.
    expect(isMatchDay(DAYS, new Date('2027-01-08T23:30:00Z'), TZ)).toBe(true);
    // 17:30 UTC on the 9th is already the 10th in ICT.
    expect(isMatchDay(DAYS, new Date('2027-01-09T17:30:00Z'), TZ)).toBe(false);
  });

  it('is false on other days and without match days', () => {
    expect(isMatchDay(DAYS, new Date('2027-01-12T03:00:00Z'), TZ)).toBe(false);
    expect(isMatchDay([], new Date('2027-01-09T01:00:00Z'), TZ)).toBe(false);
  });
});
