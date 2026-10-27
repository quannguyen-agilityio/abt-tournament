// Oracle test (spec §11): the rules engine against the real ABT 2026 workbook. The workbook holds
// real names, so it never enters the repo: set ABT_2026_XLSX to its path to run this. Skipped otherwise (CI).
import { beforeAll, describe, expect, it } from 'vitest';
import type { Import2026 } from '../../../scripts/lib/abt2026/model';
import { parseWorkbook } from '../../../scripts/lib/abt2026/parse';
import { computeGroupStandings, SHEET_ERRATA, verifyWithErrata } from '../../../scripts/lib/abt2026/verify';
import { readWorkbook } from '../../../scripts/lib/abt2026/xlsx';
import { slotHandicap } from '../handicap';
import { DEFAULT_SEASON_SETTINGS } from '../settings';

const file = process.env.ABT_2026_XLSX;

describe.skipIf(!file)('ABT 2026 workbook oracle', () => {
  let data: Import2026;

  beforeAll(async () => {
    data = parseWorkbook(await readWorkbook(file!)).data;
  });

  it('orders the standings as the sheet does', () => {
    // The sheet's rank, corrected where a known erratum says its rank formula is wrong.
    const sheetRank = (teamNumber: number) => {
      const erratum = SHEET_ERRATA.find(
        (e) => e.source === 'summary' && e.field === 'rank' && e.teamNumber === teamNumber,
      );
      return erratum ? erratum.expected : data.summary.find((s) => s.teamNumber === teamNumber)!.rank;
    };
    const result = computeGroupStandings(data);
    expect(result.pendingDraws).toEqual([]);
    expect(result.rows.map((r) => Number(r.teamId))).toEqual(
      data.teams.map((t) => t.number).sort((a, b) => sheetRank(a) - sheetRank(b)),
    );
  });

  it('matches the totals of the sheet summary and TKV_Doi', () => {
    const { failures, accepted } = verifyWithErrata(data, SHEET_ERRATA);
    expect(failures).toEqual([]);
    expect(accepted).toHaveLength(SHEET_ERRATA.length);
  });

  it('gives every group-stage set the handicap of spec §4.2', () => {
    const skill = new Map(data.players.map((p) => [p.slug, p.skill]));
    const pair = ([p1, p2]: [string, string]) => [skill.get(p1)!, skill.get(p2)!] as const;
    const group = data.matches.filter((m) => m.stage === 'group');
    expect(group.length).toBeGreaterThan(0);

    const mismatches: string[] = [];
    for (const m of group) {
      expect(m.slots, m.code).toHaveLength(DEFAULT_SEASON_SETTINGS.slot_types.length);
      for (const s of m.slots) {
        const want = slotHandicap(pair(s.home), pair(s.away), DEFAULT_SEASON_SETTINGS.group_handicap_cap);
        if (want.home !== s.handicap_home || want.away !== s.handicap_away) {
          mismatches.push(
            `${m.code} set ${s.slot_no}: sheet ${s.handicap_home}-${s.handicap_away}, §4.2 gives ${want.home}-${want.away}`,
          );
        }
      }
    }
    expect(mismatches).toEqual([]);
  });
});
