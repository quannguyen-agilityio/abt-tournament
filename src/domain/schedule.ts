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

export interface ScheduledMatch {
  id: string;
  /** Start as a comparable key (an ISO timestamp); null while unscheduled. */
  startsAt: string | null;
  homeTeamId: string | null;
  awayTeamId: string | null;
  courtId: string | null;
  refereeId: string | null;
}

export type ScheduleConflictKind = 'team' | 'referee' | 'court';

export interface ScheduleConflict {
  kind: ScheduleConflictKind;
  startsAt: string;
  /** The team, referee or court that is booked twice. */
  subjectId: string;
  /** The clashing matches, in input order. */
  matchIds: string[];
}

/**
 * Bookings that clash at the same start time (spec §6 A4): a team playing twice at once, a
 * referee on two matches at once, or two matches on one court. Unscheduled matches and unset
 * fields never clash. Conflicts come sorted by start, then kind, then first match.
 */
export function findScheduleConflicts(matches: readonly ScheduledMatch[]): ScheduleConflict[] {
  const bookings = new Map<string, ScheduleConflict>();
  const book = (kind: ScheduleConflictKind, startsAt: string, subjectId: string | null, matchId: string) => {
    if (subjectId === null) return;
    const key = `${startsAt}|${kind}|${subjectId}`;
    const booking = bookings.get(key);
    if (booking) {
      if (!booking.matchIds.includes(matchId)) booking.matchIds.push(matchId);
    } else bookings.set(key, { kind, startsAt, subjectId, matchIds: [matchId] });
  };

  for (const m of matches) {
    if (m.startsAt === null) continue;
    book('team', m.startsAt, m.homeTeamId, m.id);
    book('team', m.startsAt, m.awayTeamId, m.id);
    book('referee', m.startsAt, m.refereeId, m.id);
    book('court', m.startsAt, m.courtId, m.id);
  }

  const kinds: ScheduleConflictKind[] = ['team', 'referee', 'court'];
  const order = new Map(matches.map((m, i) => [m.id, i]));
  return [...bookings.values()]
    .filter((b) => b.matchIds.length > 1)
    .sort(
      (a, b) =>
        a.startsAt.localeCompare(b.startsAt) ||
        kinds.indexOf(a.kind) - kinds.indexOf(b.kind) ||
        order.get(a.matchIds[0])! - order.get(b.matchIds[0])!,
    );
}
