import { describe, expect, it } from 'vitest';
import { DEFAULT_SEASON_SETTINGS, type MatchStatus } from '../domain';
import {
  bracketStarted,
  groupResultState,
  parseManualDraws,
  planGroupClosure,
  tiedGroups,
  unfinishedGroupMatches,
  type CloseGroupMatch,
} from './close-group';

const settings = DEFAULT_SEASON_SETTINGS;

let seq = 0;

/** A group match where home wins 3–2 in sets, every set 31–20, so set and point differences tie. */
function match(home: string, away: string, homeWins: boolean, status: MatchStatus = 'completed'): CloseGroupMatch {
  const sets: [number, number][] = [
    [31, 20],
    [20, 31],
    [31, 20],
    [20, 31],
    [31, 20],
  ];
  return {
    id: `m${String(++seq).padStart(2, '0')}`,
    stage: 'group',
    status,
    home_team_id: home,
    away_team_id: away,
    winner_team_id: status === 'completed' ? (homeWins ? home : away) : null,
    slots: sets.map(([h, a], i) => ({
      slot_no: i + 1,
      score_home: homeWins ? h : a,
      score_away: homeWins ? a : h,
    })),
  };
}

const teams = ['A', 'B', 'C', 'D', 'E'].map((id) => ({ id }));

// A beats everyone. B, C and D beat each other in a circle with identical scores, and each beats E:
// they stay level through every step, so only the draw orders them.
const matches = (): CloseGroupMatch[] => [
  match('A', 'B', true),
  match('A', 'C', true),
  match('A', 'D', true),
  match('A', 'E', true),
  match('B', 'C', true),
  match('C', 'D', true),
  match('D', 'B', true),
  match('B', 'E', true),
  match('C', 'E', true),
  match('D', 'E', true),
];

describe('tiedGroups', () => {
  it('lists only the teams still level after step 5', () => {
    expect(tiedGroups(teams, matches(), settings)).toEqual([['B', 'C', 'D']]);
  });

  it('is empty when every position is decided', () => {
    const decided = matches().map((m) =>
      m.home_team_id === 'D' && m.away_team_id === 'B' ? match('B', 'D', true) : m,
    );
    expect(tiedGroups(teams, decided, settings)).toEqual([]);
  });
});

describe('planGroupClosure', () => {
  const plan = (drawOrder: string[], note = 'Bốc thăm ngày 1/11', ms = matches()) =>
    planGroupClosure({ teams, matches: ms, settings, drawOrder, note });

  it('applies the draw to the tied teams and seeds the bracket from the final order', () => {
    expect(plan(['D', 'B', 'C'])).toEqual({
      ok: true,
      finalOrder: ['A', 'D', 'B', 'C', 'E'],
      manualDraws: { groups: [['D', 'B', 'C']], note: 'Bốc thăm ngày 1/11' },
      bracket: [
        { code: 'SF1', home_team_id: 'A', away_team_id: 'C' },
        { code: 'SF2', home_team_id: 'D', away_team_id: 'B' },
        { code: '3RD', home_team_id: null, away_team_id: null },
        { code: 'F', home_team_id: null, away_team_id: null },
      ],
    });
  });

  it('requires a note when teams are drawn', () => {
    expect(plan(['D', 'B', 'C'], '  ')).toEqual({ ok: false, error: 'note' });
  });

  it('needs no draw or note when every position is decided', () => {
    const decided = matches().map((m) =>
      m.home_team_id === 'D' && m.away_team_id === 'B' ? match('B', 'D', true) : m,
    );
    expect(plan([], '', decided)).toMatchObject({ ok: true, manualDraws: { groups: [] } });
  });

  it.each([
    ['a missing tied team', ['D', 'B']],
    ['a team that is not tied', ['A', 'D', 'B', 'C']],
    ['a team twice', ['D', 'B', 'B']],
  ])('refuses a draw with %s: the page is out of date', (_, drawOrder) => {
    expect(plan(drawOrder)).toEqual({ ok: false, error: 'changed' });
  });

  it('refuses while a group match is still to play', () => {
    const open = [...matches().slice(0, -1), match('D', 'E', true, 'in_progress')];
    expect(plan(['D', 'B', 'C'], 'x', open)).toEqual({ ok: false, error: 'unfinished' });
  });

  it('refuses with fewer teams than the bracket needs', () => {
    const three = [{ id: 'A' }, { id: 'B' }, { id: 'C' }];
    const ms = [match('A', 'B', true), match('A', 'C', true), match('B', 'C', true)];
    expect(planGroupClosure({ teams: three, matches: ms, settings, drawOrder: [], note: '' })).toEqual({
      ok: false,
      error: 'teams',
    });
  });

  it('leaves disqualified teams out of the order', () => {
    const withDq = teams.map((t) => (t.id === 'E' ? { ...t, disqualified: true } : t));
    expect(
      planGroupClosure({ teams: withDq, matches: matches(), settings, drawOrder: ['C', 'B', 'D'], note: 'x' }),
    ).toMatchObject({ ok: true, finalOrder: ['A', 'C', 'B', 'D'] });
  });
});

describe('groupResultState', () => {
  it('orders matches and disqualified teams by id, with scores in slot order', () => {
    const a = { ...match('A', 'B', true), id: 'b-2' };
    const annulled = match('C', 'D', false, 'annulled');
    const b = { ...annulled, id: 'a-1', slots: [...annulled.slots].reverse() };
    const ko = { ...match('A', 'C', true), id: '0', stage: 'semi_final' as const };
    expect(
      groupResultState([a, b, ko], [{ id: 'z', disqualified: true }, { id: 'y' }, { id: 'x', disqualified: true }]),
    ).toEqual({
      matches: [
        {
          id: 'a-1',
          status: 'annulled',
          winner_team_id: null,
          scores: [
            [20, 31],
            [31, 20],
            [20, 31],
            [31, 20],
            [20, 31],
          ],
        },
        {
          id: 'b-2',
          status: 'completed',
          winner_team_id: 'A',
          scores: [
            [31, 20],
            [20, 31],
            [31, 20],
            [20, 31],
            [31, 20],
          ],
        },
      ],
      disqualified: ['x', 'z'],
    });
  });
});

describe('parseManualDraws', () => {
  it('reads the stored groups and note', () => {
    expect(parseManualDraws({ groups: [['B', 'C']], note: 'Bốc thăm' })).toEqual({
      groups: [['B', 'C']],
      note: 'Bốc thăm',
    });
  });

  it.each([null, {}, { groups: 'B' }, { groups: [['B', 1]] }])('falls back to no groups for %j', (value) => {
    expect(parseManualDraws(value)).toEqual({ groups: [] });
  });
});

describe('unfinishedGroupMatches and bracketStarted', () => {
  it('counts open group matches only', () => {
    const ms = [match('A', 'B', true), match('C', 'D', true, 'lineup_locked'), match('A', 'C', true, 'annulled')];
    expect(unfinishedGroupMatches(ms).map((m) => m.status)).toEqual(['lineup_locked']);
  });

  it('sees a started bracket from any bracket match past scheduled', () => {
    expect(bracketStarted([{ stage: 'semi_final', status: 'scheduled' }])).toBe(false);
    expect(
      bracketStarted([
        { stage: 'group', status: 'completed' },
        { stage: 'final', status: 'lineup_locked' },
      ]),
    ).toBe(true);
  });
});
