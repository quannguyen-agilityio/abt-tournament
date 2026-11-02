import { describe, expect, it } from 'vitest';
import {
  MAX_FEE_AMOUNT,
  MAX_PLAYER_NAME_LENGTH,
  MAX_SKILL_POINTS,
  parsePlayerEdit,
  sortSeasonPlayers,
  summarizeFees,
} from './season-players';

const TEAM = '3456bbe9-8367-4339-b11c-ef62b6d7c0af';

const VALID = {
  fullName: 'Nguyen Van A',
  gender: 'male',
  rank: '3',
  skillPoints: '120',
  teamId: TEAM,
  memberType: 'employee',
  feeAmount: '300000',
};

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

function errorsOf(fields: Record<string, string>, maxRank = 7) {
  const result = parsePlayerEdit(form({ ...VALID, ...fields }), { maxRank });
  return result.ok ? [] : result.errors;
}

describe('parsePlayerEdit', () => {
  it('accepts a valid form', () => {
    expect(parsePlayerEdit(form(VALID), { maxRank: 7 })).toEqual({
      ok: true,
      value: {
        fullName: 'Nguyen Van A',
        gender: 'male',
        rank: 3,
        skillPoints: 120,
        teamId: TEAM,
        memberType: 'employee',
        feeAmount: 300000,
      },
    });
  });

  it('maps an empty team to null', () => {
    const result = parsePlayerEdit(form({ ...VALID, teamId: '' }), { maxRank: 7 });
    expect(result.ok && result.value.teamId).toBeNull();
  });

  it('treats a missing team field as no team', () => {
    const data = form(VALID);
    data.delete('teamId');
    const result = parsePlayerEdit(data, { maxRank: 7 });
    expect(result.ok && result.value.teamId).toBeNull();
  });

  it('trims the name and collapses inner whitespace', () => {
    const result = parsePlayerEdit(form({ ...VALID, fullName: '  Tran   Thi \t B  ' }), { maxRank: 7 });
    expect(result.ok && result.value.fullName).toBe('Tran Thi B');
  });

  it('bounds the name length', () => {
    expect(errorsOf({ fullName: '   ' })).toEqual(['fullName']);
    expect(errorsOf({ fullName: 'a'.repeat(MAX_PLAYER_NAME_LENGTH) })).toEqual([]);
    expect(errorsOf({ fullName: 'a'.repeat(MAX_PLAYER_NAME_LENGTH + 1) })).toEqual(['fullName']);
  });

  it('accepts only male or female', () => {
    expect(errorsOf({ gender: 'female' })).toEqual([]);
    expect(errorsOf({ gender: 'other' })).toEqual(['gender']);
    expect(errorsOf({ gender: '' })).toEqual(['gender']);
  });

  it('bounds the rank by maxRank', () => {
    expect(errorsOf({ rank: '1' })).toEqual([]);
    expect(errorsOf({ rank: '7' })).toEqual([]);
    expect(errorsOf({ rank: '0' })).toEqual(['rank']);
    expect(errorsOf({ rank: '8' })).toEqual(['rank']);
    expect(errorsOf({ rank: '8' }, 10)).toEqual([]);
  });

  it('bounds skill points', () => {
    expect(errorsOf({ skillPoints: '0' })).toEqual([]);
    expect(errorsOf({ skillPoints: String(MAX_SKILL_POINTS) })).toEqual([]);
    expect(errorsOf({ skillPoints: String(MAX_SKILL_POINTS + 1) })).toEqual(['skillPoints']);
  });

  it('bounds the fee', () => {
    expect(errorsOf({ feeAmount: '0' })).toEqual([]);
    expect(errorsOf({ feeAmount: String(MAX_FEE_AMOUNT) })).toEqual([]);
    expect(errorsOf({ feeAmount: String(MAX_FEE_AMOUNT + 1) })).toEqual(['feeAmount']);
  });

  it.each(['3.5', '-1', '', '1e3', 'abc', '+3', '0x10', '1,000'])('rejects %j as a whole number', (value) => {
    expect(errorsOf({ rank: value })).toEqual(['rank']);
    expect(errorsOf({ skillPoints: value })).toEqual(['skillPoints']);
    expect(errorsOf({ feeAmount: value })).toEqual(['feeAmount']);
  });

  it('trims whole numbers', () => {
    const result = parsePlayerEdit(form({ ...VALID, rank: ' 4 ' }), { maxRank: 7 });
    expect(result.ok && result.value.rank).toBe(4);
  });

  it('rejects a team that is not a uuid', () => {
    expect(errorsOf({ teamId: 'not-a-uuid' })).toEqual(['team']);
  });

  it('rejects an unknown member type', () => {
    expect(errorsOf({ memberType: 'coach' })).toEqual(['memberType']);
    expect(errorsOf({ memberType: 'guest' })).toEqual([]);
  });

  it('collects every error', () => {
    const result = parsePlayerEdit(new FormData(), { maxRank: 7 });
    expect(result).toEqual({
      ok: false,
      errors: ['fullName', 'gender', 'rank', 'skillPoints', 'memberType', 'feeAmount'],
    });
  });
});

describe('summarizeFees', () => {
  it('is all zero for no players', () => {
    expect(summarizeFees([])).toEqual({ collected: 0, expected: 0, paid: 0, total: 0, unpaid: 0 });
  });

  it('sums expected and collected over active players', () => {
    expect(
      summarizeFees([
        { status: 'active', feeAmount: 300_000, paid: true },
        { status: 'active', feeAmount: 150_000, paid: true },
        { status: 'active', feeAmount: 300_000, paid: false },
      ]),
    ).toEqual({ collected: 450_000, expected: 750_000, paid: 2, total: 3, unpaid: 1 });
  });

  it('excludes withdrawn players, paid or not', () => {
    expect(
      summarizeFees([
        { status: 'active', feeAmount: 300_000, paid: false },
        { status: 'withdrawn', feeAmount: 300_000, paid: true },
        { status: 'withdrawn', feeAmount: 150_000, paid: false },
      ]),
    ).toEqual({ collected: 0, expected: 300_000, paid: 0, total: 1, unpaid: 1 });
  });

  it('counts a missing private row as fee 0, unpaid', () => {
    expect(summarizeFees([{ status: 'active', feeAmount: null, paid: false }])).toEqual({
      collected: 0,
      expected: 0,
      paid: 0,
      total: 1,
      unpaid: 1,
    });
  });
});

describe('sortSeasonPlayers', () => {
  const p = (teamName: string | null, rank: number, fullName: string) => ({ teamName, rank, fullName });

  it('orders by team, then rank, then name', () => {
    const sorted = sortSeasonPlayers([p('B', 1, 'Z'), p('A', 2, 'Y'), p('A', 1, 'X'), p('A', 1, 'W')]);
    expect(sorted.map((x) => `${x.teamName}${x.rank}${x.fullName}`)).toEqual(['A1W', 'A1X', 'A2Y', 'B1Z']);
  });

  it('puts players without a team last', () => {
    const sorted = sortSeasonPlayers([p(null, 1, 'A'), p('Z', 5, 'B'), p(null, 2, 'C')]);
    expect(sorted.map((x) => x.fullName)).toEqual(['B', 'A', 'C']);
  });

  it('compares Vietnamese names with the vi collation', () => {
    const sorted = sortSeasonPlayers([p('Đ', 1, 'a'), p('E', 1, 'a'), p('D', 1, 'a')]);
    expect(sorted.map((x) => x.teamName)).toEqual(['D', 'Đ', 'E']);
  });

  it('does not mutate its input', () => {
    const input = [p('B', 1, 'a'), p('A', 1, 'a')];
    sortSeasonPlayers(input);
    expect(input[0].teamName).toBe('B');
  });
});
