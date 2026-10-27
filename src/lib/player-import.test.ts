import { describe, expect, it } from 'vitest';
import {
  MAX_IMPORT_ROWS,
  normalizeName,
  parseCsv,
  parsePlayerCsv,
  planPlayerImport,
  slugify,
  type ImportPerson,
  type ImportSeasonPlayer,
  type ParsedRow,
  type PlanInput,
} from './player-import';

const HEADER = 'full_name,gender,rank,skill_points,member_type';
const FEES = { employee: 300_000, intern: 150_000, guest: 250_000 };

function rowsOf(text: string, maxRank = 7): ParsedRow[] {
  const result = parsePlayerCsv(text, { maxRank });
  if (!result.ok) throw new Error(`parse failed: ${result.error}`);
  return result.rows;
}

function errorsOf(line: string, maxRank = 7) {
  const [row] = rowsOf(`${HEADER}\n${line}`, maxRank);
  return row.ok ? [] : row.errors;
}

const P1: ImportPerson = { id: 'p1', fullName: 'Nguyễn Văn Ân', slug: 'nguyen-van-an', gender: 'male' };
const P2: ImportPerson = { id: 'p2', fullName: 'Trần Thị Bình', slug: 'tran-thi-binh', gender: 'female' };

function plan(csv: string, over: Partial<Omit<PlanInput, 'rows'>> = {}) {
  return planPlayerImport({
    rows: rowsOf(`${HEADER}\n${csv}`),
    persons: [],
    seasonPlayers: [],
    fees: FEES,
    resolutions: {},
    ...over,
  });
}

describe('slugify / normalizeName', () => {
  it('strips diacritics and maps đ', () => {
    expect(slugify('Nguyễn Văn Ân')).toBe('nguyen-van-an');
    expect(slugify('Đặng  Đức')).toBe('dang-duc');
    expect(slugify('  --A_b!c-- ')).toBe('a-b-c');
    expect(slugify('!!!')).toBe('');
  });
  it('keeps diacritics but folds case and whitespace', () => {
    expect(normalizeName('  Nguyễn   VĂN  Ân ')).toBe('nguyễn văn ân');
    expect(normalizeName('Nguyen Van An')).not.toBe(normalizeName('Nguyễn Văn Ân'));
  });
});

describe('parseCsv', () => {
  it('handles quotes, escaped quotes, embedded commas and newlines', () => {
    const records = parseCsv('a,b\n"x, y","say ""hi""\nthere"\nlast,1');
    expect(records).toEqual([
      { line: 1, cells: ['a', 'b'] },
      { line: 2, cells: ['x, y', 'say "hi"\nthere'] },
      { line: 4, cells: ['last', '1'] },
    ]);
  });
  it('strips the BOM, accepts CRLF and skips blank lines', () => {
    const records = parseCsv('﻿a,b\r\n\r\n1,2\r\n   \r\n3,4\r\n');
    expect(records).toEqual([
      { line: 1, cells: ['a', 'b'] },
      { line: 3, cells: ['1', '2'] },
      { line: 5, cells: ['3', '4'] },
    ]);
  });
  it('detects a semicolon delimiter only when the header has no comma', () => {
    expect(parseCsv('a;b\n1;2')[1].cells).toEqual(['1', '2']);
    expect(parseCsv('a,b;c\n1,2;3')[1].cells).toEqual(['1', '2;3']);
  });
  it('keeps a trailing empty cell', () => {
    expect(parseCsv('a,b\n1,')[1].cells).toEqual(['1', '']);
  });
});

describe('parsePlayerCsv', () => {
  it('parses a valid row, case-insensitively and in any column order', () => {
    const rows = rowsOf(' Member_Type ,RANK,extra,Full_Name,skill_points,GENDER\n Guest ,3,x,  Lê   Văn  C ,12,FEMALE');
    expect(rows).toEqual([
      {
        line: 2,
        ok: true,
        value: { fullName: 'Lê Văn C', gender: 'female', rank: 3, skillPoints: 12, memberType: 'guest' },
      },
    ]);
  });
  it('works with semicolons and a BOM', () => {
    const rows = rowsOf('﻿full_name;gender;rank;skill_points;member_type\nAn;male;1;0;intern');
    expect(rows[0].ok).toBe(true);
  });
  it('reports empty and header problems', () => {
    expect(parsePlayerCsv('', { maxRank: 7 })).toEqual({ ok: false, error: 'empty' });
    expect(parsePlayerCsv('\n  \n', { maxRank: 7 })).toEqual({ ok: false, error: 'empty' });
    expect(parsePlayerCsv('full_name,gender,rank\nA,male,1', { maxRank: 7 })).toEqual({ ok: false, error: 'header' });
    expect(parsePlayerCsv('name,gender,rank,skill_points,member_type', { maxRank: 7 })).toEqual({
      ok: false,
      error: 'header',
    });
  });
  it('accepts a header with no data rows', () => {
    expect(parsePlayerCsv(HEADER, { maxRank: 7 })).toEqual({ ok: true, rows: [] });
  });
  it('rejects more than the maximum rows', () => {
    const body = Array.from({ length: MAX_IMPORT_ROWS + 1 }, (_, i) => `P${i},male,1,0,guest`).join('\n');
    expect(parsePlayerCsv(`${HEADER}\n${body}`, { maxRank: 7 })).toEqual({ ok: false, error: 'tooMany' });
    const ok = Array.from({ length: MAX_IMPORT_ROWS }, (_, i) => `P${i},male,1,0,guest`).join('\n');
    expect(parsePlayerCsv(`${HEADER}\n${ok}`, { maxRank: 7 }).ok).toBe(true);
  });
  it('validates each field', () => {
    expect(errorsOf(',male,1,0,guest')).toEqual(['fullName']);
    expect(errorsOf(`${'a'.repeat(81)},male,1,0,guest`)).toEqual(['fullName']);
    expect(errorsOf('!!!,male,1,0,guest')).toEqual(['fullName']);
    expect(errorsOf('A,other,1,0,guest')).toEqual(['gender']);
    expect(errorsOf('A,male,0,0,guest')).toEqual(['rank']);
    expect(errorsOf('A,male,8,0,guest')).toEqual(['rank']);
    expect(errorsOf('A,male,8,0,guest', 9)).toEqual([]);
    expect(errorsOf('A,male,1.5,0,guest')).toEqual(['rank']);
    expect(errorsOf('A,male,x,0,guest')).toEqual(['rank']);
    expect(errorsOf('A,male,1,-1,guest')).toEqual(['skillPoints']);
    expect(errorsOf('A,male,1,32768,guest')).toEqual(['skillPoints']);
    expect(errorsOf('A,male,1,,guest')).toEqual(['skillPoints']);
    expect(errorsOf('A,male,1,0,staff')).toEqual(['memberType']);
  });
  it('collects every error and tolerates short rows', () => {
    expect(errorsOf('A,x,0,-1,z')).toEqual(['gender', 'rank', 'skillPoints', 'memberType']);
    expect(errorsOf('A')).toEqual(['gender', 'rank', 'skillPoints', 'memberType']);
  });
  it('keeps the raw cells of an invalid row', () => {
    const [row] = rowsOf(`${HEADER}\nAn,x,1,0,guest`);
    expect(row).toMatchObject({ ok: false, raw: { full_name: 'An', gender: 'x' } });
  });
});

describe('planPlayerImport matching', () => {
  it('treats unknown names as new persons with a slug', () => {
    const result = plan('Lê Văn C,male,3,10,employee');
    expect(result.rows).toEqual([{ line: 2, kind: 'new', name: 'Lê Văn C', newPerson: true, slug: 'le-van-c' }]);
    expect(result.ops).toEqual([
      {
        person_id: null,
        full_name: 'Lê Văn C',
        slug: 'le-van-c',
        gender: 'male',
        rank: 3,
        skill_points: 10,
        member_type: 'employee',
        fee_amount: 300_000,
      },
    ]);
    expect(result.canApply).toBe(true);
  });
  it('matches an existing person by exact name, ignoring case and spacing', () => {
    const result = plan('nguyễn  văn ân,male,3,10,guest', { persons: [P1, P2] });
    expect(result.rows[0]).toMatchObject({
      kind: 'new',
      newPerson: false,
      name: 'Nguyễn Văn Ân',
      slug: 'nguyen-van-an',
    });
    expect(result.ops[0]).toMatchObject({
      person_id: 'p1',
      full_name: 'Nguyễn Văn Ân',
      slug: null,
      fee_amount: 250_000,
    });
  });
  it('matches a diacritics-only difference through the slug', () => {
    const result = plan('Nguyen Van An,male,3,10,guest', { persons: [P1, P2] });
    expect(result.rows[0]).toMatchObject({ kind: 'new', newPerson: false, slug: 'nguyen-van-an' });
  });
  it('matches the slug family name-2, name-3', () => {
    const person = { ...P1, id: 'p9', fullName: 'Ân Nguyễn Văn', slug: 'nguyen-van-an-2' };
    const result = plan('Nguyen Van An,male,3,10,guest', { persons: [person] });
    expect(result.ops[0].person_id).toBe('p9');
    // but not a longer, different slug
    const other = { ...P1, id: 'p8', slug: 'nguyen-van-an-binh' };
    expect(plan('Nguyen Van An,male,3,10,guest', { persons: [other] }).rows[0]).toMatchObject({ newPerson: true });
  });
  it('matches a cell that is literally an existing slug', () => {
    const twin = { id: 'p3', fullName: 'Nguyễn Văn Ân', slug: 'nguyen-van-an-2', gender: 'male' as const };
    const result = plan('nguyen-van-an-2,male,3,10,guest', { persons: [P1, twin] });
    expect(result.rows[0]).toMatchObject({ kind: 'new', newPerson: false, slug: 'nguyen-van-an-2' });
    expect(result.ops[0].person_id).toBe('p3');
  });
  it('prefers exact-name matches over the slug family', () => {
    const near = { id: 'p4', fullName: 'Nguyên Văn An', slug: 'nguyen-van-an-3', gender: 'male' as const };
    const result = plan('Nguyễn Văn Ân,male,3,10,guest', { persons: [P1, near] });
    expect(result.ops[0].person_id).toBe('p1');
  });
});

describe('planPlayerImport ambiguity', () => {
  const twin: ImportPerson = { id: 'p3', fullName: 'Nguyễn Văn Ân', slug: 'nguyen-van-an-2', gender: 'male' };
  const seasonPlayers: ImportSeasonPlayer[] = [
    { personId: 'p3', rank: 3, skillPoints: 10, memberType: 'guest', feeAmount: 1 },
  ];

  it('is ambiguous when several people match, listing candidates', () => {
    const result = plan('Nguyễn Văn Ân,male,3,10,guest', { persons: [P1, twin], seasonPlayers });
    expect(result.rows[0]).toEqual({
      line: 2,
      kind: 'ambiguous',
      name: 'Nguyễn Văn Ân',
      candidates: [
        { id: 'p1', fullName: 'Nguyễn Văn Ân', slug: 'nguyen-van-an', inSeason: false },
        { id: 'p3', fullName: 'Nguyễn Văn Ân', slug: 'nguyen-van-an-2', inSeason: true },
      ],
    });
    expect(result.counts.ambiguous).toBe(1);
    expect(result.canApply).toBe(false);
  });
  it('is resolved by choosing a candidate', () => {
    const result = plan('Nguyễn Văn Ân,male,3,10,guest', {
      persons: [P1, twin],
      seasonPlayers,
      resolutions: { 2: 'p3' },
    });
    expect(result.rows[0].kind).toBe('unchanged');
    const other = plan('Nguyễn Văn Ân,male,3,10,guest', {
      persons: [P1, twin],
      seasonPlayers,
      resolutions: { 2: 'p1' },
    });
    expect(other.ops[0].person_id).toBe('p1');
  });
  it('is resolved by creating a new person', () => {
    const result = plan('Nguyễn Văn Ân,male,3,10,guest', { persons: [P1, twin], resolutions: { 2: 'new' } });
    expect(result.rows[0]).toMatchObject({ kind: 'new', newPerson: true, slug: 'nguyen-van-an-3' });
    expect(result.canApply).toBe(true);
  });
  it('stays ambiguous for a bogus choice or another line', () => {
    expect(plan('Nguyễn Văn Ân,male,3,10,guest', { persons: [P1, twin], resolutions: { 2: 'zzz' } }).rows[0].kind).toBe(
      'ambiguous',
    );
    expect(plan('Nguyễn Văn Ân,male,3,10,guest', { persons: [P1, twin], resolutions: { 5: 'p1' } }).rows[0].kind).toBe(
      'ambiguous',
    );
  });
  it('blocks apply while any row is ambiguous even with other ops', () => {
    const result = plan('Nguyễn Văn Ân,male,3,10,guest\nMới,male,1,0,guest', { persons: [P1, twin] });
    expect(result.ops).toHaveLength(1);
    expect(result.canApply).toBe(false);
  });
});

describe('planPlayerImport duplicates and slugs', () => {
  it('flags a later row for the same existing person', () => {
    const result = plan('Nguyễn Văn Ân,male,3,10,guest\nNguyen Van An,male,4,10,guest', { persons: [P1] });
    expect(result.rows.map((r) => r.kind)).toEqual(['new', 'invalid']);
    expect(result.rows[1]).toMatchObject({ errors: ['duplicate'] });
    expect(result.ops).toHaveLength(1);
  });
  it('flags a later row for the same new slug', () => {
    const result = plan('Lê C,male,3,10,guest\nLe C,male,4,10,guest');
    expect(result.rows.map((r) => r.kind)).toEqual(['new', 'invalid']);
    expect(result.counts).toMatchObject({ new: 1, invalid: 1 });
  });
  it('gives a new person a free slug when the base is taken by a non-matching person', () => {
    // A resolution of "new" forces creation next to existing people with the same slug family.
    const taken = [P1, { ...P1, id: 'p5', slug: 'nguyen-van-an-2' }];
    const result = plan('Nguyễn Văn Ân,male,3,10,guest', { persons: taken, resolutions: { 2: 'new' } });
    expect(result.rows[0]).toMatchObject({ slug: 'nguyen-van-an-3' });
  });
  it('avoids a slug generated earlier in the same file', () => {
    const taken = [P1, { ...P1, id: 'p5', slug: 'nguyen-van-an-2' }];
    const result = plan('Nguyễn Văn Ân,male,3,10,guest\nNguyen Van An 3,male,3,10,guest', {
      persons: taken,
      resolutions: { 2: 'new' },
    });
    expect(result.rows.map((r) => ('slug' in r ? r.slug : null))).toEqual(['nguyen-van-an-3', 'nguyen-van-an-3-2']);
  });
  it('keeps invalid rows out of ops and reports them', () => {
    const result = plan('A,x,1,0,guest\nB,male,1,0,guest');
    expect(result.rows[0]).toMatchObject({ kind: 'invalid', name: 'A', errors: ['gender'] });
    expect(result.counts).toMatchObject({ invalid: 1, new: 1 });
    expect(result.ops).toHaveLength(1);
  });
  it('cannot apply with nothing to do', () => {
    expect(plan('A,x,1,0,guest').canApply).toBe(false);
  });
});

describe('planPlayerImport changes and fees', () => {
  const inSeason = (over: Partial<ImportSeasonPlayer> = {}): ImportSeasonPlayer => ({
    personId: 'p1',
    rank: 3,
    skillPoints: 10,
    memberType: 'employee',
    feeAmount: 123_000,
    ...over,
  });

  it('is unchanged when every field is equal', () => {
    const result = plan('Nguyễn Văn Ân,male,3,10,employee', { persons: [P1], seasonPlayers: [inSeason()] });
    expect(result.rows[0]).toMatchObject({ kind: 'unchanged' });
    expect(result.ops).toEqual([]);
    expect(result.canApply).toBe(false);
  });
  it('lists the changed fields and keeps the custom fee for the same member type', () => {
    const result = plan('Nguyễn Văn Ân,female,4,15,employee', { persons: [P1], seasonPlayers: [inSeason()] });
    expect(result.rows[0]).toMatchObject({
      kind: 'changed',
      changes: [
        { field: 'gender', from: 'male', to: 'female' },
        { field: 'rank', from: 3, to: 4 },
        { field: 'skillPoints', from: 10, to: 15 },
      ],
    });
    expect(result.ops[0]).toMatchObject({ gender: 'female', fee_amount: 123_000 });
  });
  it('resets the fee when the member type changes', () => {
    const result = plan('Nguyễn Văn Ân,male,3,10,intern', { persons: [P1], seasonPlayers: [inSeason()] });
    expect(result.rows[0]).toMatchObject({ changes: [{ field: 'memberType', from: 'employee', to: 'intern' }] });
    expect(result.ops[0].fee_amount).toBe(150_000);
  });
  it('uses the default fee when there was no private row', () => {
    const sp = inSeason({ memberType: null, feeAmount: null });
    const result = plan('Nguyễn Văn Ân,male,3,10,guest', { persons: [P1], seasonPlayers: [sp] });
    expect(result.rows[0]).toMatchObject({ changes: [{ field: 'memberType', from: null, to: 'guest' }] });
    expect(result.ops[0].fee_amount).toBe(250_000);
  });
  it('counts every kind', () => {
    const result = plan(
      'Nguyễn Văn Ân,male,3,10,employee\nTrần Thị Bình,female,2,5,guest\nMới,male,1,0,guest\nX,x,1,0,guest',
      {
        persons: [P1, P2],
        seasonPlayers: [inSeason()],
      },
    );
    expect(result.counts).toEqual({ invalid: 1, ambiguous: 0, new: 2, changed: 0, unchanged: 1 });
  });
});
