// A small made-up workbook for the tests: 4 teams of 8 players, 6 group matches, 4 relay matches.
import { gridFromCells, type CellValue, type Grid } from './xlsx';

export type Cells = Record<string, CellValue>;

export const TEAM_NAMES = ['Red Dragons', 'Blue Whales', 'Green Hawks', 'Gold Fire Foxes'];
const FIRST = ['Alpha', 'Bravo', 'Charlie', 'Delta'];
const LAST = ['One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight'];

/** Name of player `i` (0..7) of team `t` (0..3). */
export const playerName = (t: number, i: number) => `${FIRST[t]} ${LAST[i]}`;
const skill = (i: number) => 40 - i * 3;

/** Spaces out the letters of a text the way the sheet writes dates and referees. */
const spaced = (s: string) => s.split('').join(' ');

interface GroupDef {
  code: string;
  home: number;
  away: number;
  /** Which of the 5 sets the home side wins. */
  homeWins: boolean[];
  court: number;
  date: string;
  time: CellValue;
}

const DAY1 = spaced('16.05.2026');
const GROUP: GroupDef[] = [
  { code: 'V01', home: 0, away: 1, homeWins: [true, true, true, false, false], court: 1, date: DAY1, time: 0.3541666 },
  { code: 'V02', home: 2, away: 3, homeWins: [true, false, true, true, false], court: 2, date: DAY1, time: 0.3541666 },
  { code: 'V03', home: 0, away: 2, homeWins: [true, true, true, true, false], court: 3, date: DAY1, time: '9:40' },
  { code: 'V04', home: 3, away: 1, homeWins: [false, false, true, false, false], court: 1, date: DAY1, time: '9:40' },
  { code: 'V05', home: 0, away: 3, homeWins: [true, false, true, false, true], court: 2, date: DAY1, time: '9:40' },
  { code: 'V06', home: 1, away: 2, homeWins: [false, true, true, true, false], court: 3, date: DAY1, time: 0.5625 },
];

interface KoDef {
  /** Code in the set rows (`BK1`, `BK2`, `HB`, `CK`). */
  rows: string;
  /** Code in the header row: the semi-finals are swapped. */
  header: string;
  home: number;
  away: number;
  homeWins: boolean;
  date: string;
  time: CellValue;
}

const DAY2 = spaced('23.05.2026');
const KO: KoDef[] = [
  { rows: 'BK1', header: 'BK2', home: 0, away: 3, homeWins: true, date: DAY2, time: 0.40277777 },
  { rows: 'BK2', header: 'BK1', home: 1, away: 2, homeWins: false, date: DAY2, time: 0.40277777 },
  { rows: 'HB', header: 'HB', home: 3, away: 2, homeWins: true, date: DAY2, time: '14:00' },
  { rows: 'CK', header: 'CK', home: 0, away: 2, homeWins: true, date: spaced('29.03.2025'), time: 0.63194444 },
];

const PAIRS = [
  [0, 1],
  [2, 3],
  [4, 5],
  [6, 7],
  [1, 2],
];

/** Scores of one group set: the winner gets 31. */
const groupScore = (matchNo: number, slot: number, homeWins: boolean) => {
  const loser = 14 + slot + matchNo;
  return homeWins ? { home: 31, away: loser } : { home: loser, away: 31 };
};

/** Cumulative relay scores per leg, ending at 125 for the winner. */
const relayScore = (leg: number, homeWins: boolean) => {
  const win = [25, 50, 75, 100, 125][leg];
  const lose = [20, 45, 70, 90, 110][leg];
  return homeWins ? { home: win, away: lose } : { home: lose, away: win };
};

export interface Fixture {
  cells: Record<string, Cells>;
  /** Group results as the sheet's summary should show them, in rank order. */
  summary: { team: number; played: number; won: number; setsWon: number; setsLost: number; pf: number; pa: number }[];
}

/** Builds the four sheets as plain cell objects. */
export function buildCells(): Fixture {
  const rank: Cells = { A1: 'STT', B1: 'Tên', C1: 'Lệ Phí', D1: 'Giới tính', E1: 'Rank', F1: 'Skill', G1: 'Đội' };
  const res: Cells = {};
  const totals: Cells = { A1: 'Đội' };
  const awards: Cells = { A1: 'No', B1: 'Tên' };

  // Xếp Rank and the team blocks.
  let rankRow = 2;
  TEAM_NAMES.forEach((team, t) => {
    const blockRow = 3 + t * 10;
    res[`A${blockRow}`] = team;
    for (let i = 0; i < 8; i++) {
      const name = playerName(t, i);
      rank[`A${rankRow}`] = rankRow - 1;
      rank[`B${rankRow}`] = name;
      rank[`C${rankRow}`] = 0;
      rank[`D${rankRow}`] = i % 4 === 3 ? 'Nữ' : 'Nam';
      rank[`E${rankRow}`] = `Rank ${Math.min(i + 1, 7)}`;
      rank[`F${rankRow}`] = skill(i);
      rank[`G${rankRow}`] = t + 1;
      res[`A${blockRow + 1 + i}`] = name;
      res[`B${blockRow + 1 + i}`] = `Rank ${Math.min(i + 1, 7)}`;
      res[`C${blockRow + 1 + i}`] = skill(i);
      rankRow += 1;
    }
  });

  // Matches, one block after the other.
  const tally = TEAM_NAMES.map(() => ({ played: 0, won: 0, setsWon: 0, setsLost: 0, pf: 0, pa: 0, lost: 0 }));
  const sets = TEAM_NAMES.map(() => ({ sets: 0, won: 0, pf: 0, pa: 0 }));
  let row = 4;
  const block = (o: {
    header: string;
    rows: string;
    home: number;
    away: number;
    court: number;
    date: string;
    time: CellValue;
    scores: { home: number; away: number }[];
    headerSets: [number, number];
    handicaps: { i?: number; q?: number }[];
  }) => {
    res[`Q${row - 1}`] = spaced('ZETA');
    res[`G${row}`] = o.court;
    res[`H${row}`] = o.header;
    res[`I${row}`] = 'Chấp';
    res[`J${row}`] = TEAM_NAMES[o.home];
    res[`L${row}`] = o.headerSets[0];
    res[`N${row}`] = o.headerSets[1];
    res[`O${row}`] = TEAM_NAMES[o.away];
    o.scores.forEach((score, k) => {
      const r = row + 1 + k;
      const [a, b] = PAIRS[k];
      res[`H${r}`] = `${o.rows} - ${k + 1}`;
      res[`J${r}`] = playerName(o.home, a);
      res[`K${r}`] = playerName(o.home, b);
      res[`L${r}`] = score.home;
      res[`N${r}`] = score.away;
      res[`O${r}`] = playerName(o.away, a);
      res[`P${r}`] = playerName(o.away, b);
      if (o.handicaps[k]?.i) res[`I${r}`] = o.handicaps[k].i;
      if (o.handicaps[k]?.q) res[`Q${r}`] = o.handicaps[k].q;
      sets[o.home].sets += 1;
      sets[o.away].sets += 1;
      sets[o.home].pf += score.home;
      sets[o.home].pa += score.away;
      sets[o.away].pf += score.away;
      sets[o.away].pa += score.home;
      if (score.home > score.away) sets[o.home].won += 1;
      else if (score.away > score.home) sets[o.away].won += 1;
    });
    res[`E${row + 1}`] = o.date;
    res[`F${row + 1}`] = o.time;
    row += 7;
  };

  GROUP.forEach((m, n) => {
    const scores = m.homeWins.map((w, k) => groupScore(n + 1, k + 1, w));
    const homeSets = m.homeWins.filter(Boolean).length;
    // V01: the home pair concedes 9 in set 1 (away starts with 9); set 2 the other way (home starts with 4).
    const handicaps = n === 0 ? [{ i: 9 }, { q: 4 }] : [];
    block({ header: m.code, rows: m.code, ...m, scores, headerSets: [homeSets, 5 - homeSets], handicaps });
    const [h, a] = [tally[m.home], tally[m.away]];
    for (const s of scores) {
      h.pf += s.home;
      h.pa += s.away;
      a.pf += s.away;
      a.pa += s.home;
    }
    h.played += 1;
    a.played += 1;
    h.setsWon += homeSets;
    h.setsLost += 5 - homeSets;
    a.setsWon += 5 - homeSets;
    a.setsLost += homeSets;
    if (homeSets >= 3) {
      h.won += 1;
      a.lost += 1;
    } else {
      a.won += 1;
      h.lost += 1;
    }
  });
  row += 3;
  for (const m of KO) {
    const scores = [0, 1, 2, 3, 4].map((leg) => relayScore(leg, m.homeWins));
    block({ ...m, court: 1, scores, headerSets: [0, 0], handicaps: [{ q: 3 }, { i: 2 }] });
  }

  // Summary (S:AE), in rank order; V is the stale manual column.
  const order = tally.map((_, t) => t).sort((a, b) => tally[b].won - tally[a].won);
  order.forEach((t, i) => {
    const r = 4 + i;
    const s = tally[t];
    Object.assign(res, {
      [`S${r}`]: TEAM_NAMES[t],
      [`T${r}`]: s.played,
      [`U${r}`]: s.won,
      [`V${r}`]: 99,
      [`W${r}`]: s.lost,
      [`X${r}`]: s.setsWon,
      [`Y${r}`]: s.setsLost,
      [`Z${r}`]: s.setsWon - s.setsLost,
      [`AA${r}`]: s.pf,
      [`AB${r}`]: s.pa,
      [`AC${r}`]: s.pf - s.pa,
      [`AD${r}`]: s.won,
      [`AE${r}`]: i + 1,
    });
  });

  // TKV_Doi.
  sets.forEach((s, t) => {
    const r = 2 + t;
    Object.assign(totals, {
      [`A${r}`]: t + 1,
      [`B${r}`]: TEAM_NAMES[t],
      [`C${r}`]: s.sets,
      [`D${r}`]: s.won,
      [`E${r}`]: s.sets - s.won,
      [`F${r}`]: s.pf,
      [`G${r}`]: s.pa,
      [`H${r}`]: s.pf - s.pa,
    });
  });

  // Giải phụ.
  const award = (r: number, a: Cells) => {
    awards[`A${r}`] = r - 1;
    for (const [col, v] of Object.entries(a)) awards[`${col}${r}`] = v;
  };
  award(2, {
    B: 'Best Duo',
    C: 'Sponsor X',
    D: '100k',
    E: 'Best pair',
    F: `${playerName(0, 0)} - ${playerName(0, 1)} V05-1 well played`,
    G: 'see video',
  });
  award(3, { B: 'Team Spirit', D: '600k', E: 'Loudest team', F: 'Red Dragons' });
  award(4, { B: 'Fair Play', D: 'tbd', E: 'Fairest team', F: 'BW' });
  award(5, { B: 'Comeback', D: '200k', E: 'Biggest comeback', F: 'Gold Fire' });
  award(6, { B: 'Rookie', D: '300k', E: 'Best newcomer', F: `${playerName(1, 2)} - best newcomer` });
  award(7, { E: 'Highest score', F: `${playerName(0, 0)} 31-29 ${playerName(1, 1)}` });
  award(8, { B: 'Lucky Draw', D: '100k', E: 'Random' });

  return {
    cells: { 'Xếp Rank': rank, 'Tổng hợp kết quả': res, 'Giải phụ': awards, TKV_Doi: totals },
    summary: order.map((t) => ({ team: t + 1, ...tally[t] })),
  };
}

/** The four sheets as grids; `edit` changes the cells first. */
export function fakeSheets(edit?: (cells: Record<string, Cells>) => void): Record<string, Grid> {
  const { cells } = buildCells();
  edit?.(cells);
  return Object.fromEntries(Object.entries(cells).map(([name, c]) => [name, gridFromCells(c)]));
}

/** Row of a cell holding `value` in `col` of a sheet (first match). */
export function findRow(cells: Cells, col: string, value: CellValue, from = 1): number {
  for (let r = from; r < 400; r++) if (cells[`${col}${r}`] === value) return r;
  throw new Error(`${String(value)} not found in column ${col}`);
}
