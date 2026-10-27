import { describe, expect, it } from 'vitest';
import { fakeSheets, findRow } from './fixture';
import { parseWorkbook } from './parse';
import { computeGroupStandings, computeTeamTotals, formatStandings, verifyImport } from './verify';

const RESULTS = 'Tổng hợp kết quả';
const load = (edit?: Parameters<typeof fakeSheets>[0]) => parseWorkbook(fakeSheets(edit)).data;

describe('verifyImport', () => {
  it('passes when the sheet agrees with the computed numbers', () => {
    expect(verifyImport(load())).toEqual([]);
  });

  it('reports a changed summary number', () => {
    const diffs = verifyImport(
      load((c) => {
        c[RESULTS][`AA${findRow(c[RESULTS], 'S', 'Red Dragons')}`] = 1;
      }),
    );
    expect(diffs).toHaveLength(1);
    expect(diffs[0]).toMatch(/^Standings, Red Dragons, pointsFor: computed \d+, sheet 1$/);
  });

  it('reports a changed rank', () => {
    const diffs = verifyImport(
      load((c) => {
        c[RESULTS][`AE${findRow(c[RESULTS], 'S', 'Red Dragons')}`] = 2;
      }),
    );
    expect(diffs).toEqual(['Standings, Red Dragons, rank: computed 1, sheet 2']);
  });

  it('reports a changed TKV_Doi number', () => {
    const diffs = verifyImport(
      load((c) => {
        c.TKV_Doi.D3 = 0;
      }),
    );
    expect(diffs).toEqual([expect.stringMatching(/^TKV_Doi, Blue Whales, won: computed \d+, sheet 0$/)]);
  });
});

describe('computeGroupStandings', () => {
  it('ranks the teams by matches won', () => {
    const result = computeGroupStandings(load());
    expect(result.rows.map((r) => [r.teamId, r.won])).toEqual([
      ['1', 3],
      ['2', 2],
      ['3', 1],
      ['4', 0],
    ]);
  });
});

describe('computeTeamTotals', () => {
  it('counts relay legs too, with the cumulative scores as recorded', () => {
    const data = load();
    const red = computeTeamTotals(data)[0];
    // 3 group matches and 2 relays (SF1, final): 25 slot rows, all home or away of red.
    expect(red.sets).toBe(25);
    expect(red.pointsFor).toBeGreaterThan(2 * 375);
  });
});

describe('formatStandings', () => {
  it('prints one line per team under a header', () => {
    const lines = formatStandings(load()).split('\n');
    expect(lines).toHaveLength(5);
    expect(lines[0]).toMatch(/^#\s+Team/);
    expect(lines[1]).toMatch(/^1\s+Red Dragons/);
  });
});
