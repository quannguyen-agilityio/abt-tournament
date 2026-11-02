import { describe, expect, it } from 'vitest';
import type { MatchStatus } from '../domain';
import {
  buildPlayerProfile,
  filterPlayers,
  parsePlayerFilters,
  playerFiltersToQuery,
  type ProfileMatch,
  type ProfileSlot,
} from './public-players';
import type { PublicPlayer } from './public-teams';

const player = (id: string, extra: Partial<PublicPlayer> = {}): PublicPlayer => ({
  id,
  personId: `person-${id}`,
  slug: `player-${id}`,
  name: `Player ${id}`,
  gender: 'male',
  avatarUrl: null,
  teamId: 'A',
  rank: 1,
  skill: 10,
  status: 'active',
  ...extra,
});

const slot = (
  slotNo: number,
  home: [string, string],
  away: [string, string],
  score: [number | null, number | null],
  extra: Partial<ProfileSlot> = {},
): ProfileSlot => ({
  slot_no: slotNo,
  slot_type: 'open',
  home_p1: home[0],
  home_p2: home[1],
  away_p1: away[0],
  away_p2: away[1],
  score_home: score[0],
  score_away: score[1],
  ...extra,
});

const match = (code: string, slots: ProfileSlot[], status: MatchStatus = 'completed'): ProfileMatch => ({
  id: code,
  code,
  stage: 'group',
  status,
  home_team_id: 'A',
  away_team_id: 'B',
  forfeit_team_id: null,
  slots,
});

describe('parsePlayerFilters', () => {
  const known = { teamIds: ['A', 'B'], maxRank: 7 };

  it('reads known values', () => {
    expect(parsePlayerFilters({ team: 'B', rank: '3', gender: 'female' }, known)).toEqual({
      team: 'B',
      rank: 3,
      gender: 'female',
    });
  });

  it('falls back to "all" for unknown or malformed values', () => {
    expect(parsePlayerFilters({ team: 'Z', rank: '8', gender: 'x' }, known)).toEqual({
      team: null,
      rank: null,
      gender: null,
    });
    expect(parsePlayerFilters({ rank: '0' }, known).rank).toBeNull();
    expect(parsePlayerFilters({ rank: '2.5' }, known).rank).toBeNull();
    expect(parsePlayerFilters({ rank: ['4', '5'] }, known).rank).toBe(4);
  });

  it('round-trips through the query string', () => {
    const filters = { team: 'A', rank: 2, gender: null };
    expect(playerFiltersToQuery(filters)).toEqual({ team: 'A', rank: '2' });
    expect(parsePlayerFilters(playerFiltersToQuery(filters), known)).toEqual(filters);
  });
});

describe('filterPlayers', () => {
  const players = [
    player('a', { teamId: 'A', rank: 2, gender: 'female' }),
    player('b', { teamId: 'B', rank: 1 }),
    player('c', { teamId: 'A', rank: 1 }),
    player('d', { teamId: null, rank: 2 }),
  ];

  it('applies every filter and sorts by rank', () => {
    expect(filterPlayers(players, { team: null, rank: null, gender: null }).map((p) => p.id)).toEqual([
      'b',
      'c',
      'a',
      'd',
    ]);
    expect(filterPlayers(players, { team: 'A', rank: null, gender: null }).map((p) => p.id)).toEqual(['c', 'a']);
    expect(filterPlayers(players, { team: null, rank: 2, gender: 'male' }).map((p) => p.id)).toEqual(['d']);
  });
});

describe('buildPlayerProfile', () => {
  it('lists every set played, from the player side, with the same totals as the stats', () => {
    const matches = [
      match('V02', [slot(1, ['x', 'y'], ['p', 'q'], [31, 25])]),
      match('V01', [
        slot(2, ['p', 'r'], ['x', 'z'], [31, 20], { slot_type: 'high' }),
        slot(1, ['p', 'q'], ['x', 'y'], [20, 31]),
        slot(3, ['q', 'r'], ['x', 'y'], [31, 28]),
      ]),
    ];
    const { stats, sets } = buildPlayerProfile('p', matches);

    expect(sets.map((s) => [s.matchCode, s.slotNo])).toEqual([
      ['V01', 1],
      ['V01', 2],
      ['V02', 1],
    ]);
    expect(sets[1]).toEqual({
      matchCode: 'V01',
      slotNo: 2,
      slotType: 'high',
      partnerIds: ['r'],
      opponentIds: ['x', 'z'],
      pointsFor: 31,
      pointsAgainst: 20,
      won: true,
    });
    expect(sets[2]).toMatchObject({ partnerIds: ['q'], pointsFor: 25, pointsAgainst: 31, won: false });

    expect(stats).toMatchObject({ setsPlayed: 3, setsWon: 1, setsLost: 2, pointsFor: 76, pointsAgainst: 82 });
    expect(stats.partner).toEqual({ id: 'q', sets: 2 });
  });

  it('credits the substitute, not the replaced player', () => {
    const matches = [
      match('V01', [
        slot(1, ['p', 'q'], ['x', 'y'], [31, 20], {
          substitutions: [{ side: 'home', replaced_id: 'p', substitute_id: 's' }],
        }),
      ]),
    ];
    expect(buildPlayerProfile('p', matches).sets).toEqual([]);
    expect(buildPlayerProfile('s', matches).sets[0]).toMatchObject({ partnerIds: ['q'], won: true });
  });

  it('skips unfinished, unscored and level sets, and returns zero stats for a player without a set', () => {
    const matches = [
      match('V01', [slot(1, ['p', 'q'], ['x', 'y'], [31, 20])], 'in_progress'),
      match('V02', [slot(1, ['p', 'q'], ['x', 'y'], [null, null]), slot(2, ['p', 'q'], ['x', 'y'], [20, 20])]),
    ];
    const { stats, sets } = buildPlayerProfile('p', matches);
    expect(sets).toEqual([]);
    expect(stats).toEqual({
      playerId: 'p',
      setsPlayed: 0,
      setsWon: 0,
      setsLost: 0,
      pointsFor: 0,
      pointsAgainst: 0,
      partner: null,
    });
  });
});
