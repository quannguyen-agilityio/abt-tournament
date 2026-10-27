// Parses the ABT 2026 workbook (spec §9) into an import model. Every problem found is collected
// with its cell reference and thrown together as one ImportError.
import { DEFAULT_SEASON_SETTINGS } from '../../../src/domain/settings';
import type {
  Import2026,
  ImportAward,
  ImportCourt,
  ImportMatch,
  ImportPlayer,
  ImportSlot,
  ImportTeam,
  ImportWinner,
  MatchStage,
  SummaryRow,
  TeamTotals,
} from './model';
import { duplicateSlugs, nameKey, slugify } from './names';
import type { CellValue, Grid } from './xlsx';

export const SHEET_RANK = 'Xếp Rank';
export const SHEET_RESULTS = 'Tổng hợp kết quả';
export const SHEET_AWARDS = 'Giải phụ';
export const SHEET_TOTALS = 'TKV_Doi';

/** Fixed team colors by team number (1..7). */
export const TEAM_COLORS = ['#e63946', '#f4a261', '#2a9d8f', '#457b9d', '#9b5de5', '#e9c46a', '#6d6875'];

/** The final's date as the sheet misreads it, and what it should be. */
const FINAL_DATE_TYPO = '29.03.2025';
const FINAL_DATE_FIX = '2026-05-23';

export class ImportError extends Error {
  constructor(readonly problems: string[]) {
    super(`The workbook has ${problems.length} problem(s):\n- ${problems.join('\n- ')}`);
    this.name = 'ImportError';
  }
}

const str = (v: CellValue): string | null => {
  if (v === null) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
};

const int = (v: CellValue): number | null => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string' && /^-?\d+$/.test(v.trim())) return Number(v.trim());
  return null;
};

const noSpaces = (s: string) => s.replace(/\s+/g, '');
const pad2 = (n: number) => String(n).padStart(2, '0');

// ---------------------------------------------------------------------------------------------
// Date, time, value

/** `dd.mm.yyyy` (spaces anywhere) → `yyyy-mm-dd`, or null when the text is not a date. */
export function parseDate(text: string): string | null {
  const m = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(noSpaces(text));
  if (!m) return null;
  const [day, month, year] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const d = new Date(Date.UTC(year, month - 1, day));
  if (d.getUTCFullYear() !== year || d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) return null;
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

/** An Excel day fraction (0.3541666 = 08:30) or text such as `9:40` → `HH:MM`, or null. */
export function parseTime(v: CellValue): string | null {
  if (v === null) return null;
  let minutes: number;
  if (typeof v === 'number') {
    if (v < 0 || v >= 1) return null;
    minutes = Math.round(v * 24 * 60);
  } else {
    const m = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(noSpaces(v));
    if (!m || Number(m[1]) > 23 || Number(m[2]) > 59) return null;
    minutes = Number(m[1]) * 60 + Number(m[2]);
  }
  return `${pad2(Math.floor(minutes / 60) % 24)}:${pad2(minutes % 60)}`;
}

/** `100k` → 100000, `1.5tr` → 1500000; null when it is not an amount. */
export function parseValue(v: CellValue): number | null {
  if (typeof v === 'number') return Number.isInteger(v) && v >= 0 ? v : null;
  if (v === null) return null;
  const m = /^(\d+(?:[.,]\d+)?)\s*(k|tr|m)?$/i.exec(v.trim());
  if (!m) return null;
  const unit = (m[2] ?? '').toLowerCase();
  const amount = Number(m[1].replace(',', '.')) * (unit === 'k' ? 1000 : unit ? 1_000_000 : 1);
  return Number.isInteger(Math.round(amount)) ? Math.round(amount) : null;
}

// ---------------------------------------------------------------------------------------------
// Xếp Rank

interface RankedPlayer extends ImportPlayer {
  key: string;
}

function parseRankSheet(g: Grid, problems: string[]): RankedPlayer[] {
  const players: RankedPlayer[] = [];
  for (let r = 2; r <= g.maxRow; r++) {
    const name = str(g.get(`B${r}`));
    if (!name) break;
    const where = `${SHEET_RANK}!`;
    const genderKey = nameKey(str(g.get(`D${r}`)) ?? '');
    const gender = genderKey === 'nam' ? 'male' : genderKey === 'nữ' ? 'female' : null;
    const rank = /^rank\s*(\d+)$/i.exec(str(g.get(`E${r}`)) ?? '');
    const skill = int(g.get(`F${r}`));
    const team = int(g.get(`G${r}`));
    const fee = int(g.get(`C${r}`)) ?? 0;
    if (!gender) problems.push(`${where}D${r}: gender must be Nam or Nữ`);
    if (!rank) problems.push(`${where}E${r}: rank must look like "Rank 3"`);
    if (skill === null || skill < 0) problems.push(`${where}F${r}: skill points must be a number`);
    if (team === null || team < 1 || team > TEAM_COLORS.length) problems.push(`${where}G${r}: team must be 1..7`);
    if (gender && rank && skill !== null && team !== null) {
      players.push({
        name,
        key: nameKey(name),
        slug: slugify(name),
        gender,
        rank: Number(rank[1]),
        skill,
        fee,
        teamNumber: team,
      });
    }
  }
  for (const dup of duplicateSlugs(players.map((p) => p.name))) problems.push(`${SHEET_RANK}: duplicate slug ${dup}`);
  const seen = new Set<string>();
  for (const p of players) {
    if (seen.has(p.key)) problems.push(`${SHEET_RANK}: name "${p.name}" appears twice`);
    seen.add(p.key);
  }
  return players;
}

// ---------------------------------------------------------------------------------------------
// Tổng hợp kết quả

/** Team names by number, from the blocks in column A; each block is cross-checked with `Xếp Rank`. */
function parseTeamBlocks(g: Grid, players: readonly RankedPlayer[], problems: string[]): ImportTeam[] {
  const blocks: { name: string; row: number; members: Set<string> }[] = [];
  for (let r = 1; r <= g.maxRow; r++) {
    const a = str(g.get(`A${r}`));
    if (!a) continue;
    if (str(g.get(`B${r}`)) === null) {
      // The column header row ("Tên") also has B set, so only real team names get here.
      blocks.push({ name: a, row: r, members: new Set() });
    } else if (blocks.length > 0) {
      blocks.at(-1)!.members.add(nameKey(a));
    }
  }
  if (blocks.length < 2 || blocks.length > TEAM_COLORS.length) {
    problems.push(`${SHEET_RESULTS}!A: expected 2..${TEAM_COLORS.length} team blocks, found ${blocks.length}`);
  }
  const teams = blocks.map((b, i) => ({ number: i + 1, name: b.name, color: TEAM_COLORS[i] ?? '#000000' }));
  blocks.forEach((b, i) => {
    const expected = new Set(players.filter((p) => p.teamNumber === i + 1).map((p) => p.key));
    const missing = [...expected].filter((k) => !b.members.has(k));
    const extra = [...b.members].filter((k) => !expected.has(k));
    if (missing.length || extra.length) {
      problems.push(
        `${SHEET_RESULTS}!A${b.row}: team block ${i + 1} differs from ${SHEET_RANK} (missing: ${missing.join(', ') || '-'}; extra: ${extra.join(', ') || '-'})`,
      );
    }
  });
  return teams;
}

const HEADER_CODE = /^(V(?:0[1-9]|1\d|2[01])|BK1|BK2|HB|CK)$/;
const SLOT_ROW = /^(V(?:0[1-9]|1\d|2[01])|BK1|BK2|HB|CK)-([1-5])$/;
const FINAL_CODE: Record<string, string> = { BK1: 'SF1', BK2: 'SF2', HB: '3RD', CK: 'F' };
const STAGE: Record<string, MatchStage> = { SF1: 'semi_final', SF2: 'semi_final', '3RD': 'third_place', F: 'final' };

interface Resolver {
  players: readonly RankedPlayer[];
  byKey: Map<string, RankedPlayer>;
  teamByKey: Map<string, number>;
  notes: Set<string>;
  problems: string[];
}

/** Looks a result-sheet name up in `Xếp Rank`; notes a spelling that differs from the canonical one. */
function resolvePlayer(res: Resolver, raw: string | null, cell: string): RankedPlayer | null {
  if (!raw) {
    res.problems.push(`${SHEET_RESULTS}!${cell}: player name is missing`);
    return null;
  }
  const player = res.byKey.get(nameKey(raw));
  if (!player) {
    res.problems.push(`${SHEET_RESULTS}!${cell}: unknown player "${raw}"`);
    return null;
  }
  if (raw.trim().replace(/\s+/g, ' ').normalize('NFC') !== player.name.normalize('NFC')) {
    res.notes.add(`Name "${raw}" (${SHEET_RESULTS}!${cell}) read as "${player.name}"`);
  }
  return player;
}

function parseMatch(g: Grid, row: number, res: Resolver): ImportMatch | null {
  const { problems } = res;
  const cell = (col: string, r: number) => g.get(`${col}${r}`);
  const ref = (col: string, r = row) => `${SHEET_RESULTS}!${col}${r}`;
  const headerCode = noSpaces(str(cell('H', row)) ?? '');
  const before = problems.length;

  // Slot rows follow the header.
  const slotRows: { row: number; prefix: string; no: number }[] = [];
  for (let r = row + 1; r <= g.maxRow; r++) {
    const m = SLOT_ROW.exec(noSpaces(str(cell('H', r)) ?? ''));
    if (!m) break;
    slotRows.push({ row: r, prefix: m[1], no: Number(m[2]) });
  }
  const expectedSlots = DEFAULT_SEASON_SETTINGS.sets_per_match;
  if (slotRows.length !== expectedSlots || slotRows.some((s, i) => s.no !== i + 1)) {
    problems.push(
      `${ref('H')}: match ${headerCode} needs exactly ${expectedSlots} slot rows numbered 1..${expectedSlots}`,
    );
    return null;
  }

  // The header codes of the semi-finals are swapped against their rows: trust the rows.
  const prefix = slotRows[0].prefix;
  if (slotRows.some((s) => s.prefix !== prefix)) {
    problems.push(`${ref('H')}: slot rows of ${headerCode} mix several codes`);
    return null;
  }
  const isGroup = prefix.startsWith('V');
  const code = isGroup ? prefix : FINAL_CODE[prefix];
  if (prefix !== headerCode) {
    if (isGroup || headerCode.startsWith('V'))
      problems.push(`${ref('H')}: header ${headerCode} but slot rows ${prefix}`);
    else res.notes.add(`Header ${headerCode} (${ref('H')}) has ${prefix} rows: used ${code}`);
  }
  const lastRow = slotRows.at(-1)!.row;

  // Teams, court.
  const homeName = str(cell('J', row));
  const awayName = str(cell('O', row));
  const home = res.teamByKey.get(nameKey(homeName ?? ''));
  const away = res.teamByKey.get(nameKey(awayName ?? ''));
  if (home === undefined) problems.push(`${ref('J')}: unknown home team "${homeName}"`);
  if (away === undefined) problems.push(`${ref('O')}: unknown away team "${awayName}"`);
  if (home !== undefined && home === away) problems.push(`${ref('J')}: ${code} has the same team on both sides`);
  const court = int(cell('G', row));
  if (court === null || court < 1 || court > 3) problems.push(`${ref('G')}: court must be 1..3`);

  // Date: written with spaces somewhere in column E around the match.
  let date: string | null = null;
  for (let r = row - 1; r <= lastRow && !date; r++) {
    const e = cell('E', r);
    if (typeof e === 'string') {
      const parsed = parseDate(e);
      if (parsed) {
        date = parsed;
        if (code === 'F' && noSpaces(e) === FINAL_DATE_TYPO) {
          date = FINAL_DATE_FIX;
          res.notes.add(`Final date ${FINAL_DATE_TYPO} (${ref('E', r)}) replaced by ${FINAL_DATE_FIX}`);
        }
      }
    }
  }
  if (!date) problems.push(`${ref('E')}: no date found for ${code}`);

  // Time: column F of the first slot row, else the first F in the block.
  let timeCell: CellValue = null;
  for (const r of [slotRows[0].row, ...slotRows.map((s) => s.row), row]) {
    timeCell = cell('F', r);
    if (timeCell !== null) break;
  }
  const time = parseTime(timeCell);
  if (!time) problems.push(`${ref('F', slotRows[0].row)}: no readable time for ${code}`);

  // Referee: column Q of the row above the header.
  const refRaw = str(cell('Q', row - 1));
  const refereeName = refRaw ? noSpaces(refRaw) : null;

  // Slots.
  const slots: ImportSlot[] = [];
  for (const s of slotRows) {
    const r = s.row;
    const pick = (cols: [string, string], team: number | undefined) => {
      const picked = cols.map((c) => resolvePlayer(res, str(cell(c, r)), `${c}${r}`));
      for (const [i, p] of picked.entries()) {
        if (p && team !== undefined && p.teamNumber !== team) {
          problems.push(`${ref(cols[i], r)}: "${p.name}" is not in team ${team}`);
        }
      }
      return picked;
    };
    const [h1, h2] = pick(['J', 'K'], home);
    const [a1, a2] = pick(['O', 'P'], away);
    const scoreHome = int(cell('L', r));
    const scoreAway = int(cell('N', r));
    // "Chấp" sits on the stronger side: it is the other side's start.
    const hcAway = int(cell('I', r)) ?? 0;
    const hcHome = int(cell('Q', r)) ?? 0;
    if (scoreHome === null || scoreAway === null) problems.push(`${ref('L', r)}: score missing`);
    if (hcHome < 0 || hcAway < 0) problems.push(`${ref('I', r)}: negative handicap`);
    if (hcHome !== 0 && hcAway !== 0)
      problems.push(`${ref('I', r)}: handicap on both sides (I=${hcAway}, Q=${hcHome})`);
    if (h1 && h2 && a1 && a2 && scoreHome !== null && scoreAway !== null) {
      slots.push({
        slot_no: s.no,
        slot_type: DEFAULT_SEASON_SETTINGS.slot_types[s.no - 1],
        home: [h1.slug, h2.slug],
        away: [a1.slug, a2.slug],
        handicap_home: hcHome,
        handicap_away: hcAway,
        score_home: scoreHome,
        score_away: scoreAway,
      });
    }
  }

  // Winner.
  let winner: 'home' | 'away' | null = null;
  if (slots.length === expectedSlots) {
    if (isGroup) {
      const homeSets = slots.filter((s) => s.score_home > s.score_away).length;
      const awaySets = slots.filter((s) => s.score_away > s.score_home).length;
      // A blank set counter means 0.
      const headerHome = int(cell('L', row)) ?? 0;
      const headerAway = int(cell('N', row)) ?? 0;
      if (homeSets === awaySets) problems.push(`${ref('L')}: ${code} has no winner (${homeSets}-${awaySets})`);
      else winner = homeSets > awaySets ? 'home' : 'away';
      if (headerHome !== homeSets || headerAway !== awaySets) {
        problems.push(
          `${ref('L')}: ${code} header says ${headerHome}-${headerAway} but the sets give ${homeSets}-${awaySets}`,
        );
      }
    } else {
      const target = DEFAULT_SEASON_SETTINGS.relay_milestones.at(-1)!;
      const last = slots.at(-1)!;
      const homeDone = last.score_home === target;
      const awayDone = last.score_away === target;
      if (homeDone === awayDone)
        problems.push(`${ref('L', lastRow)}: ${code} leg 5 does not end at ${target} for one side`);
      else winner = homeDone ? 'home' : 'away';
    }
  }

  if (problems.length > before || home === undefined || away === undefined || !date || !time || court === null)
    return null;
  if (winner === null) return null;
  return {
    code,
    stage: isGroup ? 'group' : STAGE[code],
    round: isGroup ? Math.ceil(Number(code.slice(1)) / 3) : null,
    homeTeam: home,
    awayTeam: away,
    court,
    date,
    scheduledAt: `${date}T${time}:00+07:00`,
    refereeName,
    slots,
    winner,
  };
}

function parseMatches(g: Grid, res: Resolver): ImportMatch[] {
  const matches: ImportMatch[] = [];
  for (let r = 1; r <= g.maxRow; r++) {
    const h = noSpaces(str(g.get(`H${r}`)) ?? '');
    if (!HEADER_CODE.test(h) || nameKey(str(g.get(`I${r}`)) ?? '') !== 'chấp') continue;
    const match = parseMatch(g, r, res);
    if (match) matches.push(match);
  }
  const seen = new Set<string>();
  for (const m of matches) {
    if (seen.has(m.code)) res.problems.push(`${SHEET_RESULTS}: match ${m.code} appears twice`);
    seen.add(m.code);
  }
  return matches;
}

/** Group summary S4:AE10; column V (a stale manual "lost" count) is ignored. */
function parseSummary(g: Grid, res: Resolver): SummaryRow[] {
  const rows: SummaryRow[] = [];
  for (let r = 4; r <= 10; r++) {
    const name = str(g.get(`S${r}`));
    if (!name) break;
    if (typeof g.get(`T${r}`) !== 'number') continue;
    const team = res.teamByKey.get(nameKey(name));
    if (team === undefined) {
      res.problems.push(`${SHEET_RESULTS}!S${r}: unknown team "${name}"`);
      continue;
    }
    const n = (col: string) => {
      const v = g.get(`${col}${r}`);
      if (v !== null && int(v) === null) res.problems.push(`${SHEET_RESULTS}!${col}${r}: number expected`);
      return int(v) ?? 0; // blank means 0
    };
    rows.push({
      teamNumber: team,
      played: n('T'),
      won: n('U'),
      lost: n('W'),
      setsWon: n('X'),
      setsLost: n('Y'),
      setDiff: n('Z'),
      pointsFor: n('AA'),
      pointsAgainst: n('AB'),
      pointDiff: n('AC'),
      points: n('AD'),
      rank: n('AE'),
    });
  }
  return rows;
}

function parseTeamTotals(g: Grid, res: Resolver): TeamTotals[] {
  const rows: TeamTotals[] = [];
  for (let r = 2; r <= 8; r++) {
    const number = int(g.get(`A${r}`));
    if (number === null) continue;
    const name = str(g.get(`B${r}`));
    if (res.teamByKey.get(nameKey(name ?? '')) !== number) {
      res.problems.push(`${SHEET_TOTALS}!B${r}: team ${number} "${name}" does not match ${SHEET_RESULTS}`);
    }
    const n = (col: string) => {
      const v = g.get(`${col}${r}`);
      if (v !== null && int(v) === null) res.problems.push(`${SHEET_TOTALS}!${col}${r}: number expected`);
      return int(v) ?? 0; // blank means 0
    };
    rows.push({
      teamNumber: number,
      sets: n('C'),
      won: n('D'),
      lost: n('E'),
      pointsFor: n('F'),
      pointsAgainst: n('G'),
      diff: n('H'),
    });
  }
  return rows;
}

// ---------------------------------------------------------------------------------------------
// Giải phụ (awards)

const MATCH_REF = /\(?\b(V(?:0[1-9]|1\d|2[01]))\s*-\s*([1-5])\b\)?/;

/** Winners from a whole-cell text in one of the supported forms; null when it is none of them. */
export function parseWinners(
  text: string,
  res: Pick<Resolver, 'byKey'> & { teams: readonly ImportTeam[]; matchCodes: ReadonlySet<string> },
): ImportWinner[] | null {
  const t = text.trim();
  if (!t || /[\r\n]/.test(t)) return null;
  const key = nameKey(t);

  // A team: its name, its initials, or a prefix of at least two words.
  const teamKeys = res.teams.map((team) => ({ team, key: nameKey(team.name) }));
  const exact = teamKeys.filter((x) => x.key === key);
  if (exact.length === 1) return [{ kind: 'team', teamNumber: exact[0].team.number }];
  const initials = (name: string) =>
    nameKey(name)
      .split(' ')
      .map((w) => Array.from(w)[0])
      .join('');
  const byInitials = teamKeys.filter((x) => x.key.includes(' ') && initials(x.team.name) === noSpaces(key));
  if (byInitials.length === 1) return [{ kind: 'team', teamNumber: byInitials[0].team.number }];
  const byPrefix = key.includes(' ') ? teamKeys.filter((x) => x.key.startsWith(key)) : [];
  if (byPrefix.length === 1) return [{ kind: 'team', teamNumber: byPrefix[0].team.number }];

  // A match reference (V05-1) is kept in the note of a pair.
  const ref = MATCH_REF.exec(t);
  const head = ref ? t.slice(0, ref.index) : t;
  const tail = ref ? t.slice(ref.index + ref[0].length).trim() : '';
  const rest = head
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[-+,;:]+$/, '')
    .trim();
  const parts = rest.split(/\s*[-+]\s*/).filter((p) => p !== '');
  const player = (name: string | undefined) => (name ? res.byKey.get(nameKey(name)) : undefined);

  const [first, second] = [player(parts[0]), player(parts[1])];
  if (first && second && first !== second) {
    const extra = [...parts.slice(2), tail].filter(Boolean).join(' - ');
    const note = [ref ? `${ref[1]}-${ref[2]}` : null, extra || null].filter(Boolean).join('; ') || null;
    const matchCode = ref && res.matchCodes.has(ref[1]) ? ref[1] : null;
    return [{ kind: 'pair', players: [first.slug, second.slug], matchCode, note }];
  }
  const whole = player(t);
  if (whole) return [{ kind: 'player', player: whole.slug, note: null }];
  const lead = player(parts[0]);
  if (lead && parts.length > 1 && !second) {
    return [{ kind: 'player', player: lead.slug, note: parts.slice(1).join(' - ') }];
  }
  return null;
}

function parseAwards(
  g: Grid,
  res: Resolver,
  teams: readonly ImportTeam[],
  matchCodes: ReadonlySet<string>,
): ImportAward[] {
  const awards: ImportAward[] = [];
  for (let r = 2; r <= g.maxRow; r++) {
    const criteria = str(g.get(`E${r}`));
    const name = str(g.get(`B${r}`)) ?? criteria;
    if (!name) continue;
    const winnersText = str(g.get(`F${r}`));
    const winners = winnersText ? parseWinners(winnersText, { byKey: res.byKey, teams, matchCodes }) : null;
    const sort = int(g.get(`A${r}`));
    awards.push({
      sortOrder: sort ?? r - 1,
      nameVi: name,
      criteriaVi: criteria ?? '',
      sponsor: str(g.get(`C${r}`)),
      valueVnd: parseValue(g.get(`D${r}`)),
      note: str(g.get(`G${r}`)),
      winners: winners ?? [],
      unparsed: winnersText && !winners ? winnersText : null,
    });
  }
  const orders = new Set<number>();
  for (const a of awards) {
    if (orders.has(a.sortOrder)) res.problems.push(`${SHEET_AWARDS}: sort order ${a.sortOrder} appears twice`);
    orders.add(a.sortOrder);
  }
  return awards;
}

// ---------------------------------------------------------------------------------------------

function findSheet(sheets: Record<string, Grid>, name: string, problems: string[]): Grid | null {
  const found = Object.keys(sheets).find((n) => nameKey(n) === nameKey(name));
  if (!found) problems.push(`Sheet "${name}" is missing`);
  return found ? sheets[found] : null;
}

/** Parses the workbook grids into the import model; throws an ImportError listing every problem. */
export function parseWorkbook(sheets: Record<string, Grid>): { data: Import2026; notes: string[] } {
  const problems: string[] = [];
  const rank = findSheet(sheets, SHEET_RANK, problems);
  const results = findSheet(sheets, SHEET_RESULTS, problems);
  const awardsSheet = findSheet(sheets, SHEET_AWARDS, problems);
  const totals = findSheet(sheets, SHEET_TOTALS, problems);
  if (!rank || !results || !awardsSheet || !totals) throw new ImportError(problems);

  const notes = new Set<string>();
  const players = parseRankSheet(rank, problems);
  const teams = parseTeamBlocks(results, players, problems);
  const res: Resolver = {
    players,
    byKey: new Map(players.map((p) => [p.key, p])),
    teamByKey: new Map(teams.map((t) => [nameKey(t.name), t.number])),
    notes,
    problems,
  };
  const matches = parseMatches(results, res);
  const summary = parseSummary(results, res);
  const teamTotals = parseTeamTotals(totals, res);
  const awards = parseAwards(awardsSheet, res, teams, new Set(matches.map((m) => m.code)));
  if (problems.length > 0) throw new ImportError(problems);

  const courtNumbers = [...new Set(matches.map((m) => m.court))].sort((a, b) => a - b);
  const courts: ImportCourt[] = courtNumbers.map((n) => ({ name: `Sân ${n}`, sort_order: n }));
  const data: Import2026 = {
    teams,
    players: players.map((p): ImportPlayer => ({
      name: p.name,
      slug: p.slug,
      gender: p.gender,
      rank: p.rank,
      skill: p.skill,
      fee: p.fee,
      teamNumber: p.teamNumber,
    })),
    courts,
    matches,
    awards,
    summary,
    teamTotals,
    matchDays: [...new Set(matches.map((m) => m.date))].sort(),
  };
  return { data, notes: [...notes] };
}
