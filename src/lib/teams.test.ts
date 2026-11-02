import { describe, expect, it } from 'vitest';
import { MAX_TEAM_NAME_LENGTH, TEAM_COLORS, nextTeamColors, parseTeamForm, sortRoster, teamWarnings } from './teams';

function form(values: Record<string, string>): FormData {
  const formData = new FormData();
  for (const [key, value] of Object.entries(values)) formData.set(key, value);
  return formData;
}

describe('nextTeamColors', () => {
  it('skips colors already used, ignoring case', () => {
    expect(nextTeamColors([TEAM_COLORS[0].toUpperCase(), TEAM_COLORS[2]], 2)).toEqual([TEAM_COLORS[1], TEAM_COLORS[3]]);
  });

  it('starts the palette over once every color is taken', () => {
    expect(nextTeamColors([...TEAM_COLORS], 2)).toEqual([TEAM_COLORS[0], TEAM_COLORS[1]]);
    expect(nextTeamColors(TEAM_COLORS.slice(1), 3)).toEqual([TEAM_COLORS[0], TEAM_COLORS[0], TEAM_COLORS[1]]);
  });

  it('returns nothing for zero teams', () => {
    expect(nextTeamColors([], 0)).toEqual([]);
  });
});

describe('parseTeamForm', () => {
  it('trims and collapses the name and lowercases the color', () => {
    expect(parseTeamForm(form({ name: '  Đội   Sấm Sét ', color: '#AABBCC' }))).toEqual({
      ok: true,
      value: { name: 'Đội Sấm Sét', color: '#aabbcc' },
    });
  });

  it('collects every error', () => {
    expect(parseTeamForm(form({ name: ' ', color: 'red' }))).toEqual({ ok: false, errors: ['name', 'color'] });
    expect(parseTeamForm(new FormData())).toEqual({ ok: false, errors: ['name', 'color'] });
  });

  it('limits the name length', () => {
    expect(parseTeamForm(form({ name: 'a'.repeat(MAX_TEAM_NAME_LENGTH), color: '#000000' })).ok).toBe(true);
    expect(parseTeamForm(form({ name: 'a'.repeat(MAX_TEAM_NAME_LENGTH + 1), color: '#000000' }))).toEqual({
      ok: false,
      errors: ['name'],
    });
  });
});

describe('sortRoster', () => {
  it('orders by rank, then skill points (high first), then name', () => {
    const players = [
      { fullName: 'B', rank: 2, skillPoints: 30, status: 'active' as const },
      { fullName: 'C', rank: 1, skillPoints: 40, status: 'active' as const },
      { fullName: 'A', rank: 2, skillPoints: 30, status: 'active' as const },
      { fullName: 'D', rank: 2, skillPoints: 35, status: 'active' as const },
    ];
    expect(sortRoster(players).map((p) => p.fullName)).toEqual(['C', 'D', 'A', 'B']);
    expect(players[0].fullName).toBe('B');
  });
});

describe('teamWarnings', () => {
  const full = (n = 7) => Array.from({ length: n }, (_, i) => ({ rank: i + 1, status: 'active' as const }));

  it('has no warnings for complete teams of equal size', () => {
    expect(
      teamWarnings(
        [
          { id: 'a', players: full() },
          { id: 'b', players: full() },
        ],
        [],
        { maxRank: 7 },
      ),
    ).toEqual({
      missingRanks: {},
      sizes: null,
      unassigned: 0,
    });
  });

  it('lists the ranks a team lacks; withdrawn players do not count', () => {
    const players = [...full(7).filter((p) => p.rank !== 3 && p.rank !== 6), { rank: 3, status: 'withdrawn' as const }];
    const result = teamWarnings([{ id: 'a', players }], [], { maxRank: 7 });
    expect(result.missingRanks).toEqual({ a: [3, 6] });
  });

  it('flags an empty team as lacking every rank', () => {
    expect(teamWarnings([{ id: 'a', players: [] }], [], { maxRank: 3 }).missingRanks).toEqual({ a: [1, 2, 3] });
  });

  it('reports every team size when the active sizes differ', () => {
    const result = teamWarnings(
      [
        { id: 'a', players: full(7) },
        { id: 'b', players: [...full(7), { rank: 7, status: 'active' }] },
        { id: 'c', players: [...full(7), { rank: 7, status: 'withdrawn' }] },
      ],
      [],
      { maxRank: 7 },
    );
    expect(result.sizes).toEqual({ a: 7, b: 8, c: 7 });
  });

  it('counts active players without a team', () => {
    expect(
      teamWarnings([], [{ status: 'active' }, { status: 'withdrawn' }, { status: 'active' }], { maxRank: 7 })
        .unassigned,
    ).toBe(2);
  });
});
