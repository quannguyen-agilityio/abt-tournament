import { describe, expect, it } from 'vitest';
import { relayHandicap, slotHandicap, type LegPairs, type PairSkills } from './handicap';
import { DEFAULT_SEASON_SETTINGS } from './settings';

const { group_handicap_cap: groupCap, ko_handicap_cap: koCap } = DEFAULT_SEASON_SETTINGS;

describe('slotHandicap', () => {
  it.each<[string, PairSkills, PairSkills, number, { home: number; away: number }]>([
    ['63 v 54 gives the 54 pair 9 (spec example)', [33, 30], [30, 24], groupCap, { home: 0, away: 9 }],
    ['54 v 63 gives the home pair 9', [30, 24], [33, 30], groupCap, { home: 9, away: 0 }],
    ['a difference of 23 is capped at 20 (spec example)', [40, 30], [27, 20], groupCap, { home: 0, away: 20 }],
    ['a difference equal to the cap is not reduced', [40, 30], [30, 20], groupCap, { home: 0, away: 20 }],
    ['a tie gives 0–0', [30, 25], [28, 27], groupCap, { home: 0, away: 0 }],
    ['a cap of 0 disables the handicap', [40, 30], [10, 10], 0, { home: 0, away: 0 }],
  ])('%s', (_name, home, away, cap, expected) => {
    expect(slotHandicap(home, away, cap)).toEqual(expected);
  });
});

/** A leg where home's pair has `diff` more skill points than away's. */
const leg = (diff: number): LegPairs => ({ home: [30 + diff, 30], away: [30, 30] });

describe('relayHandicap', () => {
  it.each<[string, number[], { home: number; away: number }]>([
    ['a net lean to home gives away the start', [3, 2, 0, 1, 4], { home: 0, away: 10 }],
    ['a net lean to away gives home the start', [-3, -2, 0, -1, -4], { home: 10, away: 0 }],
    ['legs leaning opposite ways cancel out', [12, -10, 5, -4, 0], { home: 0, away: 3 }],
    ['a fully cancelled net gives 0–0', [10, -10, 7, -7, 0], { home: 0, away: 0 }],
    ['the net sum is capped once', [10, 10, 0, 0, 0], { home: 0, away: koCap }],
    // A per-leg clamp at 15 would give 15 − 15 = 0; the net is 30 − 20 = 10.
    ['no single leg is clamped', [30, -20, 0, 0, 0], { home: 0, away: 10 }],
    ['equal pairs in every leg give 0–0', [0, 0, 0, 0, 0], { home: 0, away: 0 }],
  ])('%s', (_name, diffs, expected) => {
    expect(relayHandicap(diffs.map(leg), koCap)).toEqual(expected);
  });

  it('gives 0–0 with no legs', () => {
    expect(relayHandicap([], koCap)).toEqual({ home: 0, away: 0 });
  });
});
