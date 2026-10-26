// Group-stage schedule (spec §4.7): a single round-robin by the circle method.

export interface RoundRobinMatch<T extends string = string> {
  /** `V01`…`Vnn` in round order. */
  code: string;
  /** 1-based round number. */
  round: number;
  home: T;
  away: T;
}

/**
 * Every pair of teams meets once. An odd number of teams gets a bye each round, so 7 teams give
 * 7 rounds × 3 matches. Each team is home in half its matches, ±1 when the count is even.
 * The result depends only on the order of `teamIds`.
 */
export function generateRoundRobin<T extends string>(teamIds: readonly T[]): RoundRobinMatch<T>[] {
  if (teamIds.length < 2) throw new RangeError('A round-robin needs at least 2 teams');
  if (new Set(teamIds).size !== teamIds.length) throw new RangeError('Team ids must be unique');

  // The first position stays fixed while the others rotate. Putting the bye there keeps every
  // real team on the rotating ring, which is what balances home and away.
  const ring: (T | null)[] = teamIds.length % 2 === 0 ? [...teamIds] : [null, ...teamIds];
  const size = ring.length;
  const pairings: Omit<RoundRobinMatch<T>, 'code'>[] = [];

  for (let round = 1; round < size; round++) {
    for (let i = 0; i < size / 2; i++) {
      const top = ring[i];
      const bottom = ring[size - 1 - i];
      if (top === null || bottom === null) continue;
      // The fixed team alternates by round; the other pairs alternate by position.
      const topHome = i === 0 ? round % 2 === 1 : i % 2 === 1;
      pairings.push(topHome ? { round, home: top, away: bottom } : { round, home: bottom, away: top });
    }
    ring.splice(1, 0, ring.pop()!);
  }

  const width = Math.max(2, String(pairings.length).length);
  return pairings.map((p, i) => ({ code: `V${String(i + 1).padStart(width, '0')}`, ...p }));
}
