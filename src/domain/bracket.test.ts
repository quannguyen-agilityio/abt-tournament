import { describe, expect, it } from 'vitest';
import { advanceBracket, seedBracket, type BracketMatch } from './bracket';
import { DEFAULT_SEASON_SETTINGS } from './settings';

const ORDER = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];

const byCode = (bracket: BracketMatch[], code: string) => bracket.find((m) => m.code === code);

describe('seedBracket', () => {
  it('seeds SF1 = #1 v #4 and SF2 = #2 v #3 with the higher seed at home', () => {
    expect(seedBracket(ORDER, DEFAULT_SEASON_SETTINGS)).toEqual([
      { code: 'SF1', stage: 'semi_final', home: 'A', away: 'D', homeSeed: 1, awaySeed: 4 },
      { code: 'SF2', stage: 'semi_final', home: 'B', away: 'C', homeSeed: 2, awaySeed: 3 },
      { code: '3RD', stage: 'third_place', home: null, away: null, homeSeed: null, awaySeed: null },
      { code: 'F', stage: 'final', home: null, away: null, homeSeed: null, awaySeed: null },
    ]);
  });

  it('accepts exactly knockout_teams teams', () => {
    expect(seedBracket(['A', 'B', 'C', 'D'], DEFAULT_SEASON_SETTINGS)).toHaveLength(4);
  });

  it.each([
    ['fewer teams than knockout_teams', ['A', 'B', 'C']],
    ['duplicate ids', ['A', 'B', 'C', 'A']],
  ])('rejects %s', (_, order) => {
    expect(() => seedBracket(order, DEFAULT_SEASON_SETTINGS)).toThrow(RangeError);
  });
});

describe('advanceBracket', () => {
  const seeded = seedBracket(ORDER, DEFAULT_SEASON_SETTINGS);

  it('waits until both semi-finals have a winner', () => {
    expect(advanceBracket(seeded, {})).toEqual(seeded);
    expect(advanceBracket(seeded, { SF1: 'A' })).toEqual(seeded);
    expect(advanceBracket(seeded, { SF2: 'C' })).toEqual(seeded);
  });

  it.each([
    // [SF1 winner, SF2 winner, final home v away, third-place home v away]
    ['A', 'B', ['A', 'B'], ['C', 'D']],
    ['A', 'C', ['A', 'C'], ['B', 'D']],
    ['D', 'B', ['B', 'D'], ['A', 'C']],
    ['D', 'C', ['C', 'D'], ['A', 'B']],
  ])('SF1 won by %s and SF2 by %s: F = %j, 3RD = %j', (sf1, sf2, final, third) => {
    const bracket = advanceBracket(seeded, { SF1: sf1, SF2: sf2 });
    expect([byCode(bracket, 'F')?.home, byCode(bracket, 'F')?.away]).toEqual(final);
    expect([byCode(bracket, '3RD')?.home, byCode(bracket, '3RD')?.away]).toEqual(third);
  });

  it('keeps the seeds so the higher seed is home', () => {
    const bracket = advanceBracket(seeded, { SF1: 'D', SF2: 'B' });
    expect(byCode(bracket, 'F')).toEqual({
      code: 'F',
      stage: 'final',
      home: 'B',
      away: 'D',
      homeSeed: 2,
      awaySeed: 4,
    });
    expect(byCode(bracket, '3RD')).toEqual({
      code: '3RD',
      stage: 'third_place',
      home: 'A',
      away: 'C',
      homeSeed: 1,
      awaySeed: 3,
    });
  });

  it('leaves the semi-finals and the input unchanged', () => {
    const before = structuredClone(seeded);
    const bracket = advanceBracket(seeded, { SF1: 'A', SF2: 'B' });
    expect(bracket.slice(0, 2)).toEqual(seeded.slice(0, 2));
    expect(seeded).toEqual(before);
  });

  it('rejects a winner who did not play that semi-final', () => {
    expect(() => advanceBracket(seeded, { SF1: 'B', SF2: 'C' })).toThrow(RangeError);
  });

  it('rejects a bracket whose semi-finals are not seeded', () => {
    const unseeded = seeded.map((m) => (m.code === 'SF2' ? { ...m, home: null } : m));
    expect(() => advanceBracket(unseeded, { SF1: 'A', SF2: 'B' })).toThrow(RangeError);
  });
});
