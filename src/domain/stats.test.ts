import { describe, expect, it } from 'vitest';
import type { MatchStage, MatchStatus } from './forfeit';
import type { SlotSubstitution } from './lineup';
import { DEFAULT_SEASON_SETTINGS } from './settings';
import { computeStandings, teamStats } from './standings';
import { playerStats, type StatsMatch } from './stats';

const settings = DEFAULT_SEASON_SETTINGS;

type SetRow = [home: [string, string], away: [string, string], score: [number, number] | null];

function match(
  id: string,
  home: string,
  away: string,
  sets: SetRow[],
  extra: {
    status?: MatchStatus;
    stage?: MatchStage;
    forfeit?: string;
    substitutions?: Record<number, SlotSubstitution[]>;
  } = {},
): StatsMatch {
  return {
    id,
    stage: extra.stage ?? 'group',
    status: extra.status ?? 'completed',
    home_team_id: home,
    away_team_id: away,
    forfeit_team_id: extra.forfeit ?? null,
    slots: sets.map(([[h1, h2], [a1, a2], score], i) => ({
      slot_no: i + 1,
      home_p1: h1,
      home_p2: h2,
      away_p1: a1,
      away_p2: a2,
      substitutions: extra.substitutions?.[i + 1],
      score_home: score?.[0] ?? null,
      score_away: score?.[1] ?? null,
    })),
  };
}

/** Five sets between the same two pairs, home winning each 31–20. */
const sameSets = (home: [string, string], away: [string, string]): SetRow[] =>
  Array.from({ length: 5 }, (): SetRow => [home, away, [31, 20]]);

/**
 * A small season, teams A, B and C. Only V01 and the V02 forfeit count; the rest must be ignored.
 * In V01 set 4, a3 is replaced by a4.
 */
const fixture: StatsMatch[] = [
  match(
    'V01',
    'A',
    'B',
    [
      [
        ['a1', 'a2'],
        ['b1', 'b2'],
        [31, 25],
      ],
      [
        ['a3', 'a4'],
        ['b3', 'b4'],
        [28, 31],
      ],
      [
        ['a1', 'a5'],
        ['b1', 'b5'],
        [31, 20],
      ],
      [
        ['a2', 'a3'],
        ['b2', 'b3'],
        [31, 29],
      ],
      [
        ['a3', 'a5'],
        ['b4', 'b5'],
        [22, 31],
      ],
    ],
    { substitutions: { 4: [{ side: 'home', replaced_id: 'a3', substitute_id: 'a4' }] } },
  ),
  match('V02', 'B', 'C', sameSets(['b1', 'b2'], ['c1', 'c2']), { status: 'forfeit', forfeit: 'C' }),
  match('V03', 'A', 'C', sameSets(['a1', 'a2'], ['c1', 'c2']), { status: 'annulled' }),
  match(
    'V04',
    'C',
    'A',
    sameSets(['c1', 'c2'], ['a1', 'a2']).map(([h, a]): SetRow => [h, a, null]),
    { status: 'scheduled' },
  ),
  match('SF1', 'A', 'B', sameSets(['a1', 'a2'], ['b1', 'b2']), { stage: 'semi_final' }),
];

describe('playerStats', () => {
  const stats = playerStats(fixture);

  it('counts sets played, set wins and losses, and scoreboard points per player', () => {
    expect(stats.get('a1')).toEqual({
      playerId: 'a1',
      setsPlayed: 2,
      setsWon: 2,
      setsLost: 0,
      pointsFor: 62,
      pointsAgainst: 45,
      partner: { id: 'a2', sets: 1 },
    });
    expect(stats.get('b1')).toMatchObject({ setsPlayed: 2, setsWon: 0, setsLost: 2, pointsFor: 45, pointsAgainst: 62 });
  });

  it('excludes annulled, forfeit, unplayed and knock-out matches', () => {
    // c1 and c2 only appear in V02 (forfeit), V03 (annulled) and V04 (scheduled).
    expect(stats.has('c1')).toBe(false);
    expect(stats.has('c2')).toBe(false);
    // a1 and a2 play every set of V03 and SF1; neither adds to their two V01 sets.
    expect(stats.get('a2')?.setsPlayed).toBe(2);
    // b2's V02 sets are a forfeit: lineups are ignored.
    expect(stats.get('b2')?.setsPlayed).toBe(2);
  });

  it('credits the substitute, not the replaced player', () => {
    // a3 is registered for sets 2, 4 and 5 but replaced in set 4.
    expect(stats.get('a3')).toMatchObject({ setsPlayed: 2, setsWon: 0, setsLost: 2, pointsFor: 50, pointsAgainst: 62 });
    // a4 plays set 2 and, as the substitute, set 4.
    expect(stats.get('a4')).toMatchObject({ setsPlayed: 2, setsWon: 1, setsLost: 1, pointsFor: 59, pointsAgainst: 60 });
    // a3's only sets left are with a4 (set 2) and a5 (set 5), both lost: the first one.
    expect(stats.get('a3')?.partner).toEqual({ id: 'a4', sets: 1 });
  });

  it('picks the partner of the most sets, then of the most set wins, then the first one', () => {
    // a4: a3 (set 2, lost) and a2 (set 4, won) once each.
    expect(stats.get('a4')?.partner).toEqual({ id: 'a2', sets: 1 });
    // a1: a2 (set 1) and a5 (set 3), both won: the first partner.
    expect(stats.get('a1')?.partner).toEqual({ id: 'a2', sets: 1 });

    const more = playerStats([
      ...fixture,
      match('V05', 'A', 'C', [
        [
          ['a1', 'a5'],
          ['c1', 'c2'],
          [25, 31],
        ],
        [
          ['a2', 'a3'],
          ['c3', 'c4'],
          [31, 10],
        ],
        [
          ['a1', 'a5'],
          ['c1', 'c5'],
          [20, 31],
        ],
        [
          ['a2', 'a4'],
          ['c3', 'c2'],
          [31, 12],
        ],
        [
          ['a3', 'a4'],
          ['c4', 'c5'],
          [31, 15],
        ],
      ]),
    ]);
    expect(more.get('a1')?.partner).toEqual({ id: 'a5', sets: 3 });
  });

  it('skips sets without a score and counts a player listed twice in a pair once', () => {
    const stats = playerStats([
      match('V01', 'A', 'B', [
        [
          ['a1', 'a1'],
          ['b1', 'b2'],
          [31, 20],
        ],
        [['a2', 'a3'], ['b3', 'b4'], null],
      ]),
    ]);
    expect(stats.get('a1')).toMatchObject({ setsPlayed: 1, setsWon: 1, partner: null });
    expect(stats.has('a2')).toBe(false);
  });

  it('counts imported scores as recorded, the higher one winning the set', () => {
    // Below a start handicap or short of the target: stored as entered in 2026.
    const stats = playerStats([
      match('V01', 'A', 'B', [
        [
          ['a1', 'a2'],
          ['b1', 'b2'],
          [29, 30],
        ],
      ]),
    ]);
    expect(stats.get('a1')).toMatchObject({ setsWon: 0, setsLost: 1, pointsFor: 29, pointsAgainst: 30 });
  });
});

describe('teamStats', () => {
  const stats = teamStats(fixture, settings);

  it('gives each team its record, sets won and lost, and point difference', () => {
    expect(stats.get('A')).toEqual({
      played: 1,
      won: 1,
      lost: 0,
      points: 1,
      setsWon: 3,
      setsLost: 2,
      setDiff: 1,
      pointsFor: 143,
      pointsAgainst: 136,
      pointDiff: 7,
    });
    // B: lost V01 2–3, won the V02 forfeit 5–0 and 155–0.
    expect(stats.get('B')).toMatchObject({ played: 2, won: 1, lost: 1, setsWon: 7, setsLost: 3, pointDiff: 148 });
    expect(stats.get('C')).toMatchObject({ played: 1, won: 0, lost: 1, setsWon: 0, setsLost: 5, pointDiff: -155 });
  });

  it('matches the standings table', () => {
    const { rows } = computeStandings([{ id: 'A' }, { id: 'B' }, { id: 'C' }], fixture, settings);
    expect(rows).toHaveLength(3);
    for (const row of rows) expect(row).toMatchObject(stats.get(row.teamId)!);
  });

  it('drops the annulled matches of a disqualified team', () => {
    // C disqualified: its group matches are annulled, V02 included.
    const annulled = fixture.map((m) =>
      m.home_team_id === 'C' || m.away_team_id === 'C' ? { ...m, status: 'annulled' as const } : m,
    );
    const afterDq = teamStats(annulled, settings);
    expect(afterDq.has('C')).toBe(false);
    expect(afterDq.get('B')).toMatchObject({ played: 1, won: 0, lost: 1 });
  });
});
