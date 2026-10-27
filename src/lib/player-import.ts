// Players CSV import (spec §6, A2): parse the file, validate each row and plan what applying it does.
// Pure on purpose: the server action recomputes the plan from the database on every preview and apply.
import type { MemberType } from '@/domain/settings';
import { MAX_PLAYER_NAME_LENGTH, MAX_SKILL_POINTS, wholeNumber } from './season-players';

export const MAX_IMPORT_ROWS = 500;
/** Upper bound for the CSV text accepted by the server actions. */
export const MAX_IMPORT_BYTES = 200 * 1024;

export const REQUIRED_COLUMNS = ['full_name', 'gender', 'rank', 'skill_points', 'member_type'] as const;

export type Gender = 'male' | 'female';
export type ImportField = 'fullName' | 'gender' | 'rank' | 'skillPoints' | 'memberType';
export type RowError = ImportField | 'duplicate';

/** Slug of a name: ASCII lowercase words joined by dashes. "Nguyễn Văn Ân" becomes "nguyen-van-an". */
export function slugify(name: string): string {
  return name
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** For exact-name comparison: trimmed, single spaces, lowercase. Diacritics are kept. */
export function normalizeName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLowerCase();
}

export type CsvRecord = { line: number; cells: string[] };

/** RFC 4180-ish parser. `line` is the 1-based source line on which the record starts. */
export function parseCsv(input: string): CsvRecord[] {
  const text = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;
  const firstLine = text.split(/\r\n|\n|\r/).find((l) => l.trim() !== '') ?? '';
  const delimiter = firstLine.includes(';') && !firstLine.includes(',') ? ';' : ',';

  const records: CsvRecord[] = [];
  let cells: string[] = [];
  let cell = '';
  let quoted = false;
  let wasQuoted = false;
  let line = 1;
  let startLine = 1;

  const endRecord = () => {
    cells.push(cell);
    // A line with only whitespace is blank; an explicitly quoted empty cell still counts as content.
    if (!(cells.length === 1 && !wasQuoted && cells[0].trim() === '')) records.push({ line: startLine, cells });
    cells = [];
    cell = '';
    wasQuoted = false;
  };

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        if (ch === '\n') line++;
        else if (ch === '\r' && text[i + 1] !== '\n') line++;
        cell += ch;
      }
    } else if (ch === '"' && cell.trim() === '') {
      quoted = true;
      wasQuoted = true;
      cell = '';
    } else if (ch === delimiter) {
      cells.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      endRecord();
      line++;
      startLine = line;
    } else {
      cell += ch;
    }
  }
  if (cell !== '' || cells.length > 0 || wasQuoted) endRecord();
  return records;
}

export type PlayerValues = {
  fullName: string;
  gender: Gender;
  rank: number;
  skillPoints: number;
  memberType: MemberType;
};

export type ParsedRow =
  | { line: number; ok: true; value: PlayerValues }
  | { line: number; ok: false; raw: Record<string, string>; errors: RowError[] };

export type ParseResult = { ok: false; error: 'empty' | 'header' | 'tooMany' } | { ok: true; rows: ParsedRow[] };

function parseRow(raw: Record<string, string>, maxRank: number): { value: PlayerValues } | { errors: RowError[] } {
  const errors: RowError[] = [];

  const fullName = raw.full_name.trim().replace(/\s+/g, ' ');
  // A name without a letter or digit has no slug to be identified by.
  if (!fullName || fullName.length > MAX_PLAYER_NAME_LENGTH || slugify(fullName) === '') errors.push('fullName');

  const gender = raw.gender.trim().toLowerCase();
  if (gender !== 'male' && gender !== 'female') errors.push('gender');

  const rank = wholeNumber(raw.rank);
  if (rank === null || rank < 1 || rank > maxRank) errors.push('rank');

  const skillPoints = wholeNumber(raw.skill_points);
  if (skillPoints === null || skillPoints > MAX_SKILL_POINTS) errors.push('skillPoints');

  const memberType = raw.member_type.trim().toLowerCase();
  if (memberType !== 'employee' && memberType !== 'intern' && memberType !== 'guest') errors.push('memberType');

  if (errors.length > 0) return { errors };
  return {
    value: {
      fullName,
      gender: gender as Gender,
      rank: rank as number,
      skillPoints: skillPoints as number,
      memberType: memberType as MemberType,
    },
  };
}

export function parsePlayerCsv(text: string, { maxRank }: { maxRank: number }): ParseResult {
  const records = parseCsv(text);
  if (records.length === 0) return { ok: false, error: 'empty' };

  const header = records[0].cells.map((c) => c.trim().toLowerCase());
  const index = new Map<string, number>();
  header.forEach((name, i) => {
    if (!index.has(name)) index.set(name, i);
  });
  if (!REQUIRED_COLUMNS.every((c) => index.has(c))) return { ok: false, error: 'header' };

  const dataRecords = records.slice(1);
  if (dataRecords.length > MAX_IMPORT_ROWS) return { ok: false, error: 'tooMany' };

  const rows = dataRecords.map((record): ParsedRow => {
    const raw: Record<string, string> = {};
    for (const column of REQUIRED_COLUMNS) raw[column] = record.cells[index.get(column) as number] ?? '';
    const parsed = parseRow(raw, maxRank);
    if ('errors' in parsed) return { line: record.line, ok: false, raw, errors: parsed.errors };
    return { line: record.line, ok: true, value: parsed.value };
  });
  return { ok: true, rows };
}

// ---------------------------------------------------------------------------------------------
// Plan

export type ImportPerson = { id: string; fullName: string; slug: string; gender: Gender };
export type ImportSeasonPlayer = {
  personId: string;
  rank: number;
  skillPoints: number;
  memberType: MemberType | null;
  feeAmount: number | null;
};

export type ChangeField = 'gender' | 'rank' | 'skillPoints' | 'memberType';
export type Change = { field: ChangeField; from: string | number | null; to: string | number };
export type Candidate = { id: string; fullName: string; slug: string; inSeason: boolean };

/** One write for `import_season_players`. `person_id` and `slug` are set only for new / existing persons respectively. */
export type ImportOp = {
  person_id: string | null;
  full_name: string;
  slug: string | null;
  gender: Gender;
  rank: number;
  skill_points: number;
  member_type: MemberType;
  fee_amount: number;
};

export type PlanRow =
  | { line: number; kind: 'invalid'; name: string; errors: RowError[] }
  | { line: number; kind: 'ambiguous'; name: string; candidates: Candidate[] }
  | { line: number; kind: 'new'; name: string; newPerson: true; slug: string }
  | { line: number; kind: 'new'; name: string; newPerson: false; slug: string }
  | { line: number; kind: 'changed'; name: string; slug: string; changes: Change[] }
  | { line: number; kind: 'unchanged'; name: string; slug: string };

export type PlanKind = PlanRow['kind'];
export type ImportPlan = {
  rows: PlanRow[];
  counts: Record<PlanKind, number>;
  ops: ImportOp[];
  canApply: boolean;
};

export type PlanInput = {
  rows: ParsedRow[];
  persons: ImportPerson[];
  seasonPlayers: ImportSeasonPlayer[];
  fees: Record<MemberType, number>;
  resolutions: Record<number, string>;
};

export function planPlayerImport({ rows, persons, seasonPlayers, fees, resolutions }: PlanInput): ImportPlan {
  const personBySlug = new Map(persons.map((p) => [p.slug, p]));
  const personById = new Map(persons.map((p) => [p.id, p]));
  const playerByPerson = new Map(seasonPlayers.map((sp) => [sp.personId, sp]));
  const takenSlugs = new Set(persons.map((p) => p.slug));
  const seenKeys = new Set<string>();

  const uniqueSlug = (base: string): string => {
    let slug = base;
    for (let n = 2; takenSlugs.has(slug); n++) slug = `${base}-${n}`;
    takenSlugs.add(slug);
    return slug;
  };

  const out: PlanRow[] = [];
  const ops: ImportOp[] = [];

  for (const row of rows) {
    if (!row.ok) {
      out.push({ line: row.line, kind: 'invalid', name: row.raw.full_name.trim(), errors: row.errors });
      continue;
    }
    const v = row.value;
    const base = slugify(v.fullName);

    // Who is this row about: a person id, or null for a new person.
    let target: { id: string | null } | { candidates: ImportPerson[] };
    const bySlug = personBySlug.get(v.fullName);
    if (bySlug) {
      target = { id: bySlug.id };
    } else {
      const wanted = normalizeName(v.fullName);
      let candidates = persons.filter((p) => normalizeName(p.fullName) === wanted);
      if (candidates.length === 0) {
        const family = new RegExp(`^${base.replace(/[^a-z0-9-]/g, '')}(-\\d+)?$`);
        candidates = persons.filter((p) => family.test(p.slug));
      }
      if (candidates.length === 0) target = { id: null };
      else if (candidates.length === 1) target = { id: candidates[0].id };
      else {
        const chosen = resolutions[row.line];
        if (chosen === 'new') target = { id: null };
        else if (chosen && candidates.some((c) => c.id === chosen)) target = { id: chosen };
        else target = { candidates };
      }
    }

    if ('candidates' in target) {
      out.push({
        line: row.line,
        kind: 'ambiguous',
        name: v.fullName,
        candidates: target.candidates.map((p) => ({
          id: p.id,
          fullName: p.fullName,
          slug: p.slug,
          inSeason: playerByPerson.has(p.id),
        })),
      });
      continue;
    }

    const key = target.id ? `person:${target.id}` : `slug:${base}`;
    if (seenKeys.has(key)) {
      out.push({ line: row.line, kind: 'invalid', name: v.fullName, errors: ['duplicate'] });
      continue;
    }
    seenKeys.add(key);

    const person = target.id ? personById.get(target.id) : undefined;
    if (!person) {
      const slug = uniqueSlug(base);
      out.push({ line: row.line, kind: 'new', name: v.fullName, newPerson: true, slug });
      ops.push({
        person_id: null,
        full_name: v.fullName,
        slug,
        gender: v.gender,
        rank: v.rank,
        skill_points: v.skillPoints,
        member_type: v.memberType,
        fee_amount: fees[v.memberType],
      });
      continue;
    }

    const current = playerByPerson.get(person.id);
    const op = (feeAmount: number): ImportOp => ({
      person_id: person.id,
      full_name: person.fullName,
      slug: null,
      gender: v.gender,
      rank: v.rank,
      skill_points: v.skillPoints,
      member_type: v.memberType,
      fee_amount: feeAmount,
    });

    if (!current) {
      out.push({ line: row.line, kind: 'new', name: person.fullName, newPerson: false, slug: person.slug });
      ops.push(op(fees[v.memberType]));
      continue;
    }

    const changes: Change[] = [];
    if (person.gender !== v.gender) changes.push({ field: 'gender', from: person.gender, to: v.gender });
    if (current.rank !== v.rank) changes.push({ field: 'rank', from: current.rank, to: v.rank });
    if (current.skillPoints !== v.skillPoints) {
      changes.push({ field: 'skillPoints', from: current.skillPoints, to: v.skillPoints });
    }
    if (current.memberType !== v.memberType) {
      changes.push({ field: 'memberType', from: current.memberType, to: v.memberType });
    }
    if (changes.length === 0) {
      out.push({ line: row.line, kind: 'unchanged', name: person.fullName, slug: person.slug });
      continue;
    }
    out.push({ line: row.line, kind: 'changed', name: person.fullName, slug: person.slug, changes });
    const keepFee = current.memberType === v.memberType && current.feeAmount !== null;
    ops.push(op(keepFee ? (current.feeAmount as number) : fees[v.memberType]));
  }

  const counts: Record<PlanKind, number> = { invalid: 0, ambiguous: 0, new: 0, changed: 0, unchanged: 0 };
  for (const r of out) counts[r.kind] += 1;
  return { rows: out, counts, ops, canApply: counts.ambiguous === 0 && ops.length > 0 };
}
