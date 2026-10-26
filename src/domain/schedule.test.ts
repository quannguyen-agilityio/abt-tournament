import { describe, expect, it } from 'vitest';
import { generateRoundRobin, type RoundRobinMatch } from './schedule';

const teams = (n: number) => Array.from({ length: n }, (_, i) => `T${i + 1}`);

function homeAwayCounts(matches: RoundRobinMatch[], ids: string[]) {
  return ids.map((id) => ({
    id,
    home: matches.filter((m) => m.home === id).length,
    away: matches.filter((m) => m.away === id).length,
  }));
}

describe('generateRoundRobin', () => {
  it('gives 7 teams 7 rounds of 3 matches, 21 in total', () => {
    const matches = generateRoundRobin(teams(7));
    expect(matches).toHaveLength(21);
    const perRound = Map.groupBy(matches, (m) => m.round);
    expect([...perRound.keys()]).toEqual([1, 2, 3, 4, 5, 6, 7]);
    for (const round of perRound.values()) expect(round).toHaveLength(3);
  });

  it('gives each team one bye when the count is odd', () => {
    const ids = teams(7);
    const matches = generateRoundRobin(ids);
    for (let round = 1; round <= 7; round++) {
      const playing = matches.filter((m) => m.round === round).flatMap((m) => [m.home, m.away]);
      expect(new Set(playing).size).toBe(6);
    }
  });

  it('numbers matches V01…V21 in round order', () => {
    const matches = generateRoundRobin(teams(7));
    expect(matches.map((m) => m.code)).toEqual(
      Array.from({ length: 21 }, (_, i) => `V${String(i + 1).padStart(2, '0')}`),
    );
    expect(matches.map((m) => m.round)).toEqual([...matches.map((m) => m.round)].sort((a, b) => a - b));
  });

  it('widens the code when there are 100 matches or more', () => {
    const matches = generateRoundRobin(teams(15));
    expect(matches).toHaveLength(105);
    expect(matches[0].code).toBe('V001');
    expect(matches.at(-1)?.code).toBe('V105');
  });

  it.each([2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 16])('pairs each of %i teams with every other team once', (n) => {
    const ids = teams(n);
    const matches = generateRoundRobin(ids);
    expect(matches).toHaveLength((n * (n - 1)) / 2);
    const pairs = matches.map((m) => [m.home, m.away].sort().join('|'));
    expect(new Set(pairs).size).toBe(pairs.length);
    expect(matches.every((m) => m.home !== m.away)).toBe(true);
    // No team plays twice in a round.
    for (const round of Map.groupBy(matches, (m) => m.round).values()) {
      const playing = round.flatMap((m) => [m.home, m.away]);
      expect(new Set(playing).size).toBe(playing.length);
    }
  });

  it.each([2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 16])('balances home and away within ±1 for %i teams', (n) => {
    const ids = teams(n);
    for (const { home, away } of homeAwayCounts(generateRoundRobin(ids), ids)) {
      expect(Math.abs(home - away)).toBeLessThanOrEqual(1);
      // With an odd count every team plays an even number of matches, so it splits exactly.
      if (n % 2 === 1) expect(home).toBe(away);
    }
  });

  it('is deterministic for a given team order', () => {
    expect(generateRoundRobin(teams(7))).toEqual(generateRoundRobin(teams(7)));
  });

  it.each([
    ['fewer than 2 teams', ['T1']],
    ['duplicate ids', ['T1', 'T2', 'T1']],
  ])('rejects %s', (_, ids) => {
    expect(() => generateRoundRobin(ids)).toThrow(RangeError);
  });
});
