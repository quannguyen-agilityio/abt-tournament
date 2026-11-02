import { describe, expect, it } from 'vitest';
import type { MatchStage, MatchStatus } from './forfeit';
import { DEFAULT_SEASON_SETTINGS } from './settings';
import { computeStandings, type StandingsMatch, type StandingsTeam } from './standings';

const settings = DEFAULT_SEASON_SETTINGS;

let seq = 0;

/**
 * A match where the home side wins `homeSets` and the away side the rest of 5 sets. Every set
 * won is 31–20 unless `sets` gives the scores.
 */
function match(
  home: string,
  away: string,
  homeSets: number,
  extra: { status?: MatchStatus; stage?: MatchStage; sets?: [number, number][]; forfeit?: string } = {},
): StandingsMatch {
  const sets =
    extra.sets ?? Array.from({ length: 5 }, (_, i): [number, number] => (i < homeSets ? [31, 20] : [20, 31]));
  return {
    id: `m${++seq}`,
    stage: extra.stage ?? 'group',
    status: extra.status ?? 'completed',
    home_team_id: home,
    away_team_id: away,
    forfeit_team_id: extra.forfeit ?? null,
    slots: sets.map(([h, a], i) => ({ slot_no: i + 1, score_home: h, score_away: a })),
  };
}

const teams = (...ids: string[]): StandingsTeam[] => ids.map((id) => ({ id }));
const order = (result: ReturnType<typeof computeStandings>) => result.rows.map((r) => r.teamId);
const decided = (result: ReturnType<typeof computeStandings>) =>
  Object.fromEntries(result.rows.map((r) => [r.teamId, r.decidedBy]));

describe('computeStandings: totals', () => {
  it('counts played, won, lost, points, sets and scoreboard points', () => {
    const result = computeStandings(
      teams('A', 'B', 'C'),
      [
        match('A', 'B', 3, {
          sets: [
            [31, 20],
            [31, 25],
            [18, 31],
            [31, 29],
            [10, 31],
          ],
        }),
        match('C', 'A', 1),
      ],
      settings,
    );
    const a = result.rows.find((r) => r.teamId === 'A')!;
    expect(a).toMatchObject({
      played: 2,
      won: 2,
      lost: 0,
      points: 2,
      setsWon: 7,
      setsLost: 3,
      setDiff: 4,
      // 121–136 against B, then 4×31 + 20 = 144 for and 31 + 4×20 = 111 against C.
      pointsFor: 121 + 144,
      pointsAgainst: 136 + 111,
      pointDiff: 121 + 144 - 136 - 111,
    });
    expect(result.rows.find((r) => r.teamId === 'B')).toMatchObject({ played: 1, won: 0, lost: 1, points: 0 });
    expect(result.rows.map((r) => r.rank)).toEqual([1, 2, 3]);
  });

  it('counts only completed and forfeit group matches', () => {
    const ignored: StandingsMatch[] = [
      match('B', 'A', 5, { status: 'annulled' }),
      match('B', 'A', 5, { status: 'scheduled', sets: [] }),
      match('B', 'A', 5, { status: 'lineup_locked', sets: [] }),
      match('B', 'A', 5, { status: 'in_progress', sets: [[31, 0]] }),
      match('B', 'A', 5, { stage: 'semi_final' }),
    ];
    const result = computeStandings(teams('A', 'B'), [match('A', 'B', 3), ...ignored], settings);
    expect(result.rows.map((r) => [r.teamId, r.played, r.points])).toEqual([
      ['A', 1, 1],
      ['B', 1, 0],
    ]);
  });

  it('scores a forfeit as 5–0 in sets and 31–0 in every set, whatever the slots hold', () => {
    const result = computeStandings(
      teams('A', 'B'),
      [match('A', 'B', 5, { status: 'forfeit', forfeit: 'A', sets: [] })],
      settings,
    );
    expect(result.rows[0]).toMatchObject({
      teamId: 'B',
      won: 1,
      setsWon: 5,
      setsLost: 0,
      pointsFor: 155,
      pointsAgainst: 0,
    });
    expect(result.rows[1]).toMatchObject({ teamId: 'A', lost: 1, setsWon: 0, setsLost: 5, pointDiff: -155 });
  });

  it('leaves disqualified teams and all their matches out, and lists them separately', () => {
    const result = computeStandings(
      [{ id: 'A' }, { id: 'X', disqualified: true }, { id: 'B' }],
      [match('X', 'A', 5), match('X', 'B', 5, { status: 'annulled' }), match('B', 'A', 3)],
      settings,
    );
    expect(order(result)).toEqual(['B', 'A']);
    expect(result.rows.find((r) => r.teamId === 'A')!.played).toBe(1);
    expect(result.disqualified).toEqual(['X']);
  });

  it('ignores blank set scores and matches without both teams', () => {
    const blank: StandingsMatch = {
      ...match('A', 'B', 3),
      slots: [
        { slot_no: 1, score_home: 31, score_away: 20 },
        { slot_no: 2, score_home: null, score_away: null },
      ],
    };
    const result = computeStandings(teams('A', 'B'), [blank, { ...match('A', 'B', 5), away_team_id: null }], settings);
    expect(result.rows[0]).toMatchObject({
      teamId: 'A',
      played: 1,
      setsWon: 1,
      setsLost: 0,
      pointsFor: 31,
      pointsAgainst: 20,
    });
  });

  it('skips a match whose sets are level (bad data is not a result)', () => {
    const result = computeStandings(
      teams('A', 'B'),
      [
        match('A', 'B', 0, {
          sets: [
            [31, 20],
            [20, 31],
          ],
        }),
      ],
      settings,
    );
    expect(result.rows.every((r) => r.played === 0)).toBe(true);
  });
});

describe('computeStandings: ranking order', () => {
  it('ranks by points first', () => {
    const result = computeStandings(
      teams('C', 'B', 'A'),
      [match('A', 'B', 3), match('A', 'C', 3), match('B', 'C', 3)],
      settings,
    );
    expect(order(result)).toEqual(['A', 'B', 'C']);
    expect(decided(result)).toEqual({ A: 'points', B: 'points', C: 'points' });
  });

  it('separates two teams level on points by their head-to-head, ahead of set difference', () => {
    // A beat B 3–2. Both have 2 points, but B has the better overall set difference.
    const result = computeStandings(
      teams('B', 'A', 'C', 'D', 'E'),
      [match('A', 'B', 3), match('A', 'C', 3), match('D', 'A', 5), match('B', 'C', 5), match('B', 'E', 5)],
      settings,
    );
    const [a, b] = ['A', 'B'].map((id) => result.rows.find((r) => r.teamId === id)!);
    expect(a.points).toBe(2);
    expect(b.points).toBe(2);
    expect(b.setDiff).toBeGreaterThan(a.setDiff);
    expect(order(result).slice(0, 2)).toEqual(['A', 'B']);
    expect(decided(result)).toMatchObject({ A: 'head_to_head', B: 'head_to_head', D: 'points' });
  });

  it('falls through to overall set difference when two level teams have not met yet', () => {
    const result = computeStandings(teams('A', 'B', 'C', 'D'), [match('A', 'C', 3), match('B', 'D', 5)], settings);
    expect(order(result).slice(0, 2)).toEqual(['B', 'A']);
    expect(decided(result)).toMatchObject({ A: 'set_diff', B: 'set_diff' });
  });

  it('ranks three teams level on points by head-to-head points in the mini-table', () => {
    // A, B and C each win 2; among themselves A won 2, B 1 and C 0.
    const result = computeStandings(
      teams('C', 'B', 'A', 'D', 'E'),
      [
        match('A', 'B', 3),
        match('A', 'C', 3),
        match('B', 'C', 3),
        match('B', 'D', 3),
        match('C', 'D', 3),
        match('C', 'E', 3),
      ],
      settings,
    );
    expect(order(result).slice(0, 3)).toEqual(['A', 'B', 'C']);
    expect(decided(result)).toMatchObject({ A: 'mini_points', B: 'mini_points', C: 'mini_points' });
  });

  it('ranks the 3-way loop A > B > C > A by head-to-head set difference', () => {
    // Mini-table set difference: A +1 − 1 = 0, B −1 + 3 = +2, C −3 + 1 = −2.
    const result = computeStandings(
      teams('A', 'B', 'C'),
      [match('A', 'B', 3), match('B', 'C', 4), match('C', 'A', 3)],
      settings,
    );
    expect(order(result)).toEqual(['B', 'A', 'C']);
    expect(decided(result)).toEqual({ A: 'mini_set_diff', B: 'mini_set_diff', C: 'mini_set_diff' });
  });

  it('ranks the 3-way loop by head-to-head point difference when set difference is level', () => {
    // Every match 3–2, so mini SD is 0 for all; the scores make the point difference.
    const close: [number, number][] = [
      [31, 30],
      [31, 30],
      [31, 30],
      [30, 31],
      [30, 31],
    ];
    const wide: [number, number][] = [
      [31, 10],
      [31, 10],
      [31, 10],
      [30, 31],
      [30, 31],
    ];
    const result = computeStandings(
      teams('A', 'B', 'C'),
      [match('A', 'B', 3, { sets: wide }), match('B', 'C', 3, { sets: close }), match('C', 'A', 3, { sets: close })],
      settings,
    );
    expect(result.rows.every((r) => r.setDiff === 0)).toBe(true);
    expect(order(result)).toEqual(['A', 'C', 'B']);
    expect(decided(result)).toEqual({ A: 'mini_point_diff', B: 'mini_point_diff', C: 'mini_point_diff' });
  });

  it('sends a partial split on to overall set difference without re-using head-to-head (A2)', () => {
    // Loop A > B (3–2), B > C (5–0), C > A (4–1): mini SD A −2, B +4, C −2, so B is separated.
    // A and C stay level on mini SD and PD (every set won is 31–20). C beat A, but A has the
    // better overall SD from beating D 5–0, so A is ahead: the A–C result is not used again.
    const result = computeStandings(
      teams('C', 'A', 'B', 'D'),
      [
        match('A', 'B', 3),
        match('B', 'C', 5),
        match('C', 'A', 4),
        match('A', 'D', 5),
        match('C', 'D', 3),
        match('B', 'D', 3),
      ],
      settings,
    );
    expect(order(result)).toEqual(['B', 'A', 'C', 'D']);
    expect(decided(result)).toEqual({ B: 'mini_set_diff', A: 'set_diff', C: 'set_diff', D: 'points' });
  });

  it('uses overall point difference after overall set difference', () => {
    const wide: [number, number][] = [
      [31, 0],
      [31, 0],
      [31, 0],
      [0, 31],
      [0, 31],
    ];
    const result = computeStandings(
      teams('A', 'B', 'C', 'D'),
      [match('A', 'C', 3), match('B', 'D', 3, { sets: wide })],
      settings,
    );
    expect(order(result).slice(0, 2)).toEqual(['B', 'A']);
    expect(decided(result)).toMatchObject({ A: 'point_diff', B: 'point_diff' });
  });

  it('leaves teams level on everything to the draw, in input order until it is made', () => {
    const result = computeStandings(teams('A', 'B', 'C', 'D'), [match('A', 'C', 3), match('B', 'D', 3)], settings);
    expect(order(result)).toEqual(['A', 'B', 'C', 'D']);
    expect(decided(result)).toEqual({ A: 'draw', B: 'draw', C: 'draw', D: 'draw' });
    expect(result.pendingDraws).toEqual([
      ['A', 'B'],
      ['C', 'D'],
    ]);
  });

  it('orders drawn teams by the manual draw and clears the pending draws it covers', () => {
    const matches = [match('A', 'C', 3), match('B', 'D', 3)];
    const result = computeStandings(teams('A', 'B', 'C', 'D'), matches, settings, ['B', 'A']);
    expect(order(result)).toEqual(['B', 'A', 'C', 'D']);
    expect(result.pendingDraws).toEqual([['C', 'D']]);
    expect(computeStandings(teams('A', 'B', 'C', 'D'), matches, settings, ['D', 'C', 'B', 'A']).pendingDraws).toEqual(
      [],
    );
  });

  it('puts every team in a draw before any match is played', () => {
    const result = computeStandings(teams('A', 'B', 'C'), [], settings);
    expect(order(result)).toEqual(['A', 'B', 'C']);
    expect(result.pendingDraws).toEqual([['A', 'B', 'C']]);
  });
});
