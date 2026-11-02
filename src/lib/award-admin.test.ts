import { describe, expect, it } from 'vitest';
import {
  MAX_AWARD_NAME_LENGTH,
  MAX_AWARD_NOTE_LENGTH,
  moveItem,
  parseAwardForm,
  parseValueVnd,
  parseWinnerForm,
  type WinnerContext,
} from './award-admin';

const TEAM_A = '11111111-1111-4111-8111-111111111111';
const TEAM_B = '22222222-2222-4222-8222-222222222222';
const P1 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
const P2 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2';
const P3 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3';
const P4 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4';
const MATCH_AB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1';

const CONTEXT: WinnerContext = {
  players: new Map([
    [P1, TEAM_A],
    [P2, TEAM_A],
    [P3, TEAM_B],
    [P4, null],
  ]),
  teamIds: new Set([TEAM_A, TEAM_B]),
  matches: [{ id: MATCH_AB, home_team_id: TEAM_A, away_team_id: TEAM_B }],
};

function form(fields: Record<string, string | string[]>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    for (const v of Array.isArray(value) ? value : [value]) data.append(key, v);
  }
  return data;
}

describe('parseValueVnd', () => {
  it('reads plain digits and thousands separators', () => {
    expect(parseValueVnd('1000000')).toBe(1_000_000);
    expect(parseValueVnd(' 1.000.000 ')).toBe(1_000_000);
    expect(parseValueVnd('1,500 000')).toBe(1_500_000);
  });

  it('is null when blank and NaN for anything else', () => {
    expect(parseValueVnd('  ')).toBeNull();
    expect(parseValueVnd('-5')).toBeNaN();
    expect(parseValueVnd('1e6')).toBeNaN();
  });
});

describe('parseAwardForm', () => {
  it('trims the fields and turns blank optional ones into null', () => {
    const result = parseAwardForm(
      form({ nameVi: ' Cặp đôi ăn ý ', nameEn: ' ', criteriaVi: ' Thắng nhiều nhất ', sponsor: '', value: '' }),
    );
    expect(result).toEqual({
      ok: true,
      value: {
        name_vi: 'Cặp đôi ăn ý',
        name_en: null,
        criteria_vi: 'Thắng nhiều nhất',
        criteria_en: null,
        sponsor: null,
        value_vnd: null,
        note: null,
      },
    });
  });

  it('keeps every filled field', () => {
    const result = parseAwardForm(
      form({
        nameVi: 'Giải A',
        nameEn: 'Award A',
        criteriaVi: 'Tiêu chí',
        criteriaEn: 'Criteria',
        sponsor: 'Công ty Demo',
        value: '2.000.000',
        note: 'Trao cuối giải',
      }),
    );
    expect(result).toEqual({
      ok: true,
      value: {
        name_vi: 'Giải A',
        name_en: 'Award A',
        criteria_vi: 'Tiêu chí',
        criteria_en: 'Criteria',
        sponsor: 'Công ty Demo',
        value_vnd: 2_000_000,
        note: 'Trao cuối giải',
      },
    });
  });

  it('requires the VI name', () => {
    expect(parseAwardForm(form({ nameVi: '  ', nameEn: 'Award' }))).toEqual({ ok: false, error: 'name' });
  });

  it('refuses a value that is not a whole, sensible amount', () => {
    expect(parseAwardForm(form({ nameVi: 'A', value: 'abc' }))).toEqual({ ok: false, error: 'value' });
    expect(parseAwardForm(form({ nameVi: 'A', value: '99999999999' }))).toEqual({ ok: false, error: 'value' });
  });

  it('refuses text over the limits', () => {
    expect(parseAwardForm(form({ nameVi: 'x'.repeat(MAX_AWARD_NAME_LENGTH + 1) }))).toEqual({
      ok: false,
      error: 'tooLong',
    });
    expect(parseAwardForm(form({ nameVi: 'A', note: 'x'.repeat(MAX_AWARD_NOTE_LENGTH + 1) }))).toEqual({
      ok: false,
      error: 'tooLong',
    });
  });
});

describe('parseWinnerForm', () => {
  it('takes one player, with a match their team played', () => {
    expect(parseWinnerForm(form({ kind: 'player', member: P1, match: MATCH_AB, note: ' MVP ' }), CONTEXT)).toEqual({
      ok: true,
      value: { kind: 'player', teamId: null, members: [P1], matchId: MATCH_AB, note: 'MVP' },
    });
  });

  it('takes a pair of two different players on one team', () => {
    expect(parseWinnerForm(form({ kind: 'pair', member: [P1, P2] }), CONTEXT)).toEqual({
      ok: true,
      value: { kind: 'pair', teamId: null, members: [P1, P2], matchId: null, note: null },
    });
    expect(parseWinnerForm(form({ kind: 'pair', member: [P1, P1] }), CONTEXT)).toEqual({
      ok: false,
      error: 'members',
    });
    expect(parseWinnerForm(form({ kind: 'pair', member: [P1, P3] }), CONTEXT)).toEqual({
      ok: false,
      error: 'sameTeam',
    });
  });

  it('ignores blank member pickers but needs the right count', () => {
    expect(parseWinnerForm(form({ kind: 'pair', member: [P1, ''] }), CONTEXT)).toEqual({
      ok: false,
      error: 'members',
    });
    expect(parseWinnerForm(form({ kind: 'player', member: [P1, P2] }), CONTEXT)).toEqual({
      ok: false,
      error: 'members',
    });
  });

  it('refuses players outside the season', () => {
    expect(parseWinnerForm(form({ kind: 'player', member: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc' }), CONTEXT)).toEqual({
      ok: false,
      error: 'members',
    });
  });

  it('takes a team of the season, with no members', () => {
    expect(parseWinnerForm(form({ kind: 'team', team: TEAM_B, member: '' }), CONTEXT)).toEqual({
      ok: true,
      value: { kind: 'team', teamId: TEAM_B, members: [], matchId: null, note: null },
    });
    expect(parseWinnerForm(form({ kind: 'team', team: P1 }), CONTEXT)).toEqual({ ok: false, error: 'team' });
  });

  it('refuses an unknown kind', () => {
    expect(parseWinnerForm(form({ kind: 'coach', member: P1 }), CONTEXT)).toEqual({ ok: false, error: 'kind' });
  });

  it('refuses a match the team did not play or that is not in the season', () => {
    const other = { ...CONTEXT, teamIds: new Set([TEAM_A, TEAM_B, 'x']) };
    expect(parseWinnerForm(form({ kind: 'team', team: TEAM_A, match: 'nope' }), other)).toEqual({
      ok: false,
      error: 'match',
    });
    const noB = { ...CONTEXT, matches: [{ id: MATCH_AB, home_team_id: TEAM_A, away_team_id: TEAM_A }] };
    expect(parseWinnerForm(form({ kind: 'player', member: P3, match: MATCH_AB }), noB)).toEqual({
      ok: false,
      error: 'match',
    });
  });

  it('lets a player without a team link any match of the season', () => {
    expect(parseWinnerForm(form({ kind: 'player', member: P4, match: MATCH_AB }), CONTEXT)).toMatchObject({
      ok: true,
    });
  });
});

describe('moveItem', () => {
  it('moves an item to a new index', () => {
    expect(moveItem(['a', 'b', 'c', 'd'], 0, 2)).toEqual(['b', 'c', 'a', 'd']);
    expect(moveItem(['a', 'b', 'c', 'd'], 3, 1)).toEqual(['a', 'd', 'b', 'c']);
  });
});
