import { describe, expect, it } from 'vitest';
import { fakeSheets, findRow, playerName, TEAM_NAMES } from './fixture';
import { ImportError, parseDate, parseTime, parseValue, parseWinners, parseWorkbook } from './parse';
import { gridFromCells } from './xlsx';

const RESULTS = 'Tổng hợp kết quả';
const parse = (edit?: Parameters<typeof fakeSheets>[0]) => parseWorkbook(fakeSheets(edit));
const problems = (edit: Parameters<typeof fakeSheets>[0]) => {
  try {
    parse(edit);
  } catch (e) {
    if (e instanceof ImportError) return e.problems;
    throw e;
  }
  return [];
};
const match = (code: string, edit?: Parameters<typeof fakeSheets>[0]) =>
  parse(edit).data.matches.find((m) => m.code === code)!;

describe('parseWorkbook', () => {
  it('reads teams, players, courts, matches and match days', () => {
    const { data } = parse();
    expect(data.teams.map((t) => t.name)).toEqual(TEAM_NAMES);
    expect(new Set(data.teams.map((t) => t.color)).size).toBe(4);
    expect(data.players).toHaveLength(32);
    expect(data.players[0]).toMatchObject({ name: 'Alpha One', slug: 'alpha-one', gender: 'male', rank: 1, skill: 40 });
    expect(data.players[3].gender).toBe('female');
    expect(data.courts).toEqual([
      { name: 'Sân 1', sort_order: 1 },
      { name: 'Sân 2', sort_order: 2 },
      { name: 'Sân 3', sort_order: 3 },
    ]);
    expect(data.matches.map((m) => m.code)).toEqual([
      'V01',
      'V02',
      'V03',
      'V04',
      'V05',
      'V06',
      'SF1',
      'SF2',
      '3RD',
      'F',
    ]);
    expect(data.matchDays).toEqual(['2026-05-16', '2026-05-23']);
  });

  it('derives stage, round, slot types and the referee', () => {
    const v04 = match('V04');
    expect(v04).toMatchObject({ stage: 'group', round: 2, court: 1, homeTeam: 4, awayTeam: 2, refereeName: 'ZETA' });
    expect(v04.slots.map((s) => s.slot_type)).toEqual(['open', 'low', 'open', 'high', 'open']);
    expect(match('SF1')).toMatchObject({ stage: 'semi_final', round: null });
    expect(match('3RD').stage).toBe('third_place');
  });

  it('maps the Chấp number to the other side (I → away, Q → home)', () => {
    const v01 = match('V01');
    expect(v01.slots[0]).toMatchObject({ handicap_home: 0, handicap_away: 9 });
    expect(v01.slots[1]).toMatchObject({ handicap_home: 4, handicap_away: 0 });
    expect(v01.slots[2]).toMatchObject({ handicap_home: 0, handicap_away: 0 });
  });

  it('recomputes relay leg handicaps from skill points and notes the Q column', () => {
    const r = findRow(fakeSheetCells(), 'H', 'BK1 - 1');
    const { data, notes } = parse((c) => {
      // The away pair loses a strong player: the home pair is 18 points stronger, so away starts with 18.
      c[RESULTS][`P${r}`] = playerName(3, 7);
      c[RESULTS][`I${r}`] = 18;
    });
    const sf1 = data.matches.find((m) => m.code === 'SF1')!;
    expect(sf1.slots[0]).toMatchObject({ handicap_home: 0, handicap_away: 18, score_home: 25, score_away: 20 });
    expect(sf1.slots[1]).toMatchObject({ handicap_home: 0, handicap_away: 0 });
    expect(notes).toContain('Relay Q column recomputed from skill points; 8 leg(s) differed from the sheet');
  });

  it('errors when a relay I value disagrees with the skill points', () => {
    const r = findRow(fakeSheetCells(), 'H', 'HB - 2');
    const errs = problems((c) => {
      c[RESULTS][`I${r}`] = 3;
    });
    expect(errs).toEqual([`${RESULTS}!I${r}: relay handicap 3 but skill points give 0`]);
  });

  it('rejects a handicap on both sides', () => {
    const errs = problems((c) => {
      const r = findRow(c[RESULTS], 'H', 'V03 - 1');
      c[RESULTS][`I${r}`] = 5;
      c[RESULTS][`Q${r}`] = 7;
    });
    expect(errs.join('\n')).toMatch(/handicap on both sides/);
  });

  it('takes the semi-final code from the set rows, not the swapped header', () => {
    const { data, notes } = parse();
    const sf1 = data.matches.find((m) => m.code === 'SF1')!;
    expect(sf1.homeTeam).toBe(1);
    expect(sf1.awayTeam).toBe(4);
    expect(notes.filter((n) => n.startsWith('Header BK'))).toHaveLength(2);
  });

  it('replaces the final date 29.03.2025 and records the fix', () => {
    const { data, notes } = parse();
    expect(data.matches.find((m) => m.code === 'F')!.date).toBe('2026-05-23');
    expect(notes.some((n) => n.includes('29.03.2025') && n.includes('2026-05-23'))).toBe(true);
  });

  it('builds scheduled_at in +07:00 from a day fraction and from text', () => {
    expect(match('V01').scheduledAt).toBe('2026-05-16T08:30:00+07:00');
    expect(match('V03').scheduledAt).toBe('2026-05-16T09:40:00+07:00');
    expect(match('V06').scheduledAt).toBe('2026-05-16T13:30:00+07:00');
  });

  it('errors when a match has no date', () => {
    const errs = problems((c) => {
      delete c[RESULTS][`E${findRow(c[RESULTS], 'H', 'V02') + 1}`];
    });
    expect(errs.join('\n')).toMatch(/no date found for V02/);
  });

  it('fixes name casing against Xếp Rank and notes it', () => {
    const r = findRow(fakeSheetCells(), 'H', 'V02 - 1');
    const { data, notes } = parse((c) => {
      c[RESULTS][`J${r}`] = 'cHARLIE One';
    });
    expect(data.matches.find((m) => m.code === 'V02')!.slots[0].home[0]).toBe('charlie-one');
    expect(notes.some((n) => n.includes('cHARLIE One') && n.includes('Charlie One'))).toBe(true);
  });

  it('errors on an unknown player, with the cell', () => {
    const r = findRow(fakeSheetCells(), 'H', 'V02 - 1');
    const errs = problems((c) => {
      c[RESULTS][`K${r}`] = 'Zulu Nine';
    });
    expect(errs).toEqual([`${RESULTS}!K${r}: unknown player "Zulu Nine"`]);
  });

  it('errors when a slot player is not in the match team', () => {
    const r = findRow(fakeSheetCells(), 'H', 'V02 - 1');
    const errs = problems((c) => {
      c[RESULTS][`J${r}`] = playerName(0, 7);
    });
    expect(errs.join('\n')).toMatch(/is not in team 3/);
  });

  it('errors when a team block differs from Xếp Rank', () => {
    const errs = problems((c) => {
      c['Xếp Rank'].G2 = 2;
    });
    expect(errs.join('\n')).toMatch(/team block 1 differs/);
  });

  it('errors when the header set count disagrees with the sets', () => {
    const errs = problems((c) => {
      c[RESULTS][`L${findRow(c[RESULTS], 'H', 'V01')}`] = 4;
    });
    expect(errs.join('\n')).toMatch(/V01 header says 4-2/);
  });

  it('derives the group winner from sets and the relay winner from leg 5', () => {
    expect(match('V01').winner).toBe('home');
    expect(match('V04').winner).toBe('away');
    expect(match('SF1').winner).toBe('home');
    expect(match('SF2').winner).toBe('away');
  });

  it('requires five slot rows', () => {
    const errs = problems((c) => {
      c[RESULTS][`H${findRow(c[RESULTS], 'H', 'V05 - 5')}`] = null;
    });
    expect(errs.join('\n')).toMatch(/needs exactly 5 slot rows/);
  });

  it('reads the summary (ignoring column V) and TKV_Doi', () => {
    const { data } = parse();
    expect(data.summary).toHaveLength(4);
    expect(data.summary[0]).toMatchObject({ teamNumber: 1, played: 3, won: 3, lost: 0, rank: 1 });
    expect(data.teamTotals).toHaveLength(4);
    expect(data.teamTotals[0]).toMatchObject({ teamNumber: 1, sets: 25 });
  });

  it('reads awards with values and notes', () => {
    const { data } = parse();
    expect(data.awards).toHaveLength(7);
    expect(data.awards[0]).toMatchObject({
      sortOrder: 1,
      nameVi: 'Best Duo',
      sponsor: 'Sponsor X',
      valueVnd: 100000,
      note: 'see video',
    });
    expect(data.awards[2].valueVnd).toBeNull();
    expect(data.awards[5]).toMatchObject({ nameVi: 'Highest score', criteriaVi: 'Highest score' });
  });

  it('parses winners in the supported forms and leaves the rest by hand', () => {
    const awards = parse().data.awards;
    expect(awards[0].winners).toEqual([
      { kind: 'pair', players: ['alpha-one', 'alpha-two'], matchCode: 'V05', note: 'V05-1; well played' },
    ]);
    expect(awards[1].winners).toEqual([{ kind: 'team', teamNumber: 1 }]);
    expect(awards[2].winners).toEqual([{ kind: 'team', teamNumber: 2 }]);
    expect(awards[3].winners).toEqual([{ kind: 'team', teamNumber: 4 }]);
    expect(awards[4].winners).toEqual([{ kind: 'player', player: 'bravo-three', note: 'best newcomer' }]);
    expect(awards[5].winners).toEqual([]);
    expect(awards[5].unparsed).toContain('31-29');
    expect(awards[6]).toMatchObject({ winners: [], unparsed: null });
  });
});

function fakeSheetCells() {
  let cells: Record<string, Record<string, unknown>> = {};
  fakeSheets((c) => {
    cells = c;
  });
  return cells[RESULTS] as Record<string, string | number | null>;
}

describe('parseDate', () => {
  it('reads dates written with spaces', () => {
    expect(parseDate('  1 6. 0 5 . 2 0 2 6')).toBe('2026-05-16');
    expect(parseDate('2 3  .  0 5  .  2 0 2 6')).toBe('2026-05-23');
  });

  it('rejects other text and impossible dates', () => {
    expect(parseDate('S Á N G')).toBeNull();
    expect(parseDate('31.02.2026')).toBeNull();
  });
});

describe('parseTime', () => {
  it('reads Excel day fractions and H:MM text', () => {
    expect(parseTime(0.3541666)).toBe('08:30');
    expect(parseTime('9:40')).toBe('09:40');
    expect(parseTime('14:05')).toBe('14:05');
  });

  it('rejects anything else', () => {
    expect(parseTime(null)).toBeNull();
    expect(parseTime('noon')).toBeNull();
    expect(parseTime('25:00')).toBeNull();
  });
});

describe('parseValue', () => {
  it('reads amounts in thousands', () => {
    expect(parseValue('100k')).toBe(100000);
    expect(parseValue('600K')).toBe(600000);
    expect(parseValue('1.5tr')).toBe(1500000);
    expect(parseValue(250000)).toBe(250000);
  });

  it('gives null for text that is no amount', () => {
    expect(parseValue('a bottle')).toBeNull();
    expect(parseValue(null)).toBeNull();
  });
});

describe('parseWinners', () => {
  const { data } = parse();
  const ctx = {
    byKey: new Map(data.players.map((p) => [p.name.toLowerCase(), p])) as never,
    teams: data.teams,
    matchCodes: new Set(['V05']),
  };

  it('does not guess between teams with the same initials', () => {
    const clash = {
      ...ctx,
      teams: [
        { number: 1, name: 'Red Dragons', color: '' },
        { number: 2, name: 'Rapid Dogs', color: '' },
      ],
    };
    expect(parseWinners('RD', clash)).toBeNull();
  });

  it('ignores multi-line cells', () => {
    expect(parseWinners('Red Dragons\nBlue Whales', ctx)).toBeNull();
  });

  it('accepts a + pair and a plain player', () => {
    expect(parseWinners('Alpha One + Alpha Two', ctx)).toEqual([
      { kind: 'pair', players: ['alpha-one', 'alpha-two'], matchCode: null, note: null },
    ]);
    expect(parseWinners('Alpha One', ctx)).toEqual([{ kind: 'player', player: 'alpha-one', note: null }]);
  });

  it('keeps a match code that does not exist in the note only', () => {
    expect(parseWinners('Alpha One - Alpha Two V18-3', ctx)).toEqual([
      { kind: 'pair', players: ['alpha-one', 'alpha-two'], matchCode: null, note: 'V18-3' },
    ]);
  });
});

describe('gridFromCells', () => {
  it('returns null for empty cells and tracks the last row', () => {
    const g = gridFromCells({ A1: 'x', B7: 3 });
    expect(g.get('A2')).toBeNull();
    expect(g.maxRow).toBe(7);
  });
});
