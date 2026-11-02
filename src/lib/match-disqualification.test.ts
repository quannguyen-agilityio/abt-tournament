import { describe, expect, it } from 'vitest';
import {
  disqualificationPlan,
  parseDisqualifyForm,
  parseReinstateForm,
  reinstatementPlan,
  sameIds,
  type DisqualificationMatch,
} from './match-disqualification';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const C = '33333333-3333-4333-8333-333333333333';
const M1 = '44444444-4444-4444-8444-444444444441';
const M2 = '44444444-4444-4444-8444-444444444442';

function form(values: [string, string][]): FormData {
  const formData = new FormData();
  for (const [key, value] of values) formData.append(key, value);
  return formData;
}

const match = (id: string, code: string, home: string, away: string, over: Partial<DisqualificationMatch> = {}) =>
  ({
    id,
    code,
    stage: 'group',
    status: 'scheduled',
    status_before_annul: null,
    home_team_id: home,
    away_team_id: away,
    ...over,
  }) satisfies DisqualificationMatch;

describe('disqualificationPlan', () => {
  it('lists every group match of the team, played ones included, sorted by code', () => {
    const matches = [
      match('m3', 'V03', A, C),
      match('m1', 'V01', A, B, { status: 'completed' }),
      match('m2', 'V02', B, C, { status: 'completed' }),
    ];
    expect(disqualificationPlan(A, matches, false)).toEqual({
      ok: true,
      rows: [
        { id: 'm1', code: 'V01', from: 'completed', to: 'annulled' },
        { id: 'm3', code: 'V03', from: 'scheduled', to: 'annulled' },
      ],
      forfeit: null,
    });
  });

  it('turns the next knock-out match into a forfeit once the group is closed', () => {
    const matches = [
      match('m1', 'V01', A, B, { status: 'completed' }),
      match('sf', 'SF1', B, A, { stage: 'semi_final' }),
    ];
    expect(disqualificationPlan(A, matches, true)).toEqual({
      ok: true,
      rows: [{ id: 'sf', code: 'SF1', from: 'scheduled', to: 'forfeit' }],
      forfeit: { matchId: 'sf', side: 'away' },
    });
  });

  it('gives the message key when refused', () => {
    expect(disqualificationPlan(A, [match('m1', 'V01', A, B, { status: 'completed' })], true)).toEqual({
      ok: false,
      messageKey: 'Disqualification.errors.NO_NEXT_MATCH',
    });
  });
});

describe('reinstatementPlan', () => {
  const annulled = (id: string, code: string, home: string, away: string, before: 'completed' | 'scheduled') =>
    match(id, code, home, away, { status: 'annulled', status_before_annul: before });

  it('restores the previous statuses except against a team still disqualified', () => {
    const matches = [annulled('m1', 'V01', A, B, 'completed'), annulled('m2', 'V02', C, A, 'scheduled')];
    expect(reinstatementPlan(A, matches, false, [A, C])).toEqual({
      ok: true,
      rows: [{ id: 'm1', code: 'V01', from: 'annulled', to: 'completed' }],
      forfeit: null,
    });
  });

  it('is refused once the group is closed', () => {
    expect(reinstatementPlan(A, [annulled('m1', 'V01', A, B, 'completed')], true, [A])).toEqual({
      ok: false,
      messageKey: 'Disqualification.errors.GROUP_CLOSED',
    });
  });
});

describe('parseDisqualifyForm', () => {
  it('reads the team, a trimmed reason and the listed matches', () => {
    const formData = form([
      ['teamId', A],
      ['reason', '  only 3 present '],
      ['matchIds', M1],
      ['matchIds', M2],
    ]);
    expect(parseDisqualifyForm(formData)).toEqual({ teamId: A, reason: 'only 3 present', matchIds: [M1, M2] });
  });

  it('accepts an empty list and an empty reason for the action to judge', () => {
    expect(parseDisqualifyForm(form([['teamId', A]]))).toEqual({ teamId: A, reason: '', matchIds: [] });
  });

  it.each([
    ['a bad team id', [['teamId', 'x']]],
    [
      'a bad match id',
      [
        ['teamId', A],
        ['matchIds', 'nope'],
      ],
    ],
  ] as [string, [string, string][]][])('refuses %s', (_name, values) => {
    expect(parseDisqualifyForm(form(values))).toBeNull();
  });
});

describe('parseReinstateForm', () => {
  it('reads the team and the listed matches', () => {
    expect(
      parseReinstateForm(
        form([
          ['teamId', A],
          ['matchIds', M1],
        ]),
      ),
    ).toEqual({ teamId: A, matchIds: [M1] });
  });

  it('refuses a bad id', () => {
    expect(
      parseReinstateForm(
        form([
          ['teamId', A],
          ['matchIds', ''],
        ]),
      ),
    ).toBeNull();
  });
});

describe('sameIds', () => {
  it('ignores the order', () => {
    expect(sameIds([M1, M2], [M2, M1])).toBe(true);
  });

  it.each([
    [[M1], [M1, M2]],
    [
      [M1, M1],
      [M1, M2],
    ],
    [[M1], [M2]],
  ])('tells %j and %j apart', (a, b) => {
    expect(sameIds(a, b)).toBe(false);
  });
});
