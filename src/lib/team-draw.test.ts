import { describe, expect, it } from 'vitest';
import { MAX_DRAW_ROWS, parseDrawCsv, planDrawImport, type DrawPlayer, type DrawRow, type DrawTeam } from './team-draw';
import { MAX_TEAM_NAME_LENGTH, TEAM_COLORS } from './teams';

const HEADER = 'full_name,team_name';

function rowsOf(body: string): DrawRow[] {
  const result = parseDrawCsv(`${HEADER}\n${body}`);
  if (!result.ok) throw new Error(`parse failed: ${result.error}`);
  return result.rows;
}

const RED: DrawTeam = { id: 't1', name: 'Đội Đỏ', color: TEAM_COLORS[1] };
const BLUE: DrawTeam = { id: 't2', name: 'Đội Xanh', color: TEAM_COLORS[0] };
const AN: DrawPlayer = { id: 's1', fullName: 'Nguyễn Văn Ân', slug: 'nguyen-van-an', teamId: null };
const BINH: DrawPlayer = { id: 's2', fullName: 'Trần Thị Bình', slug: 'tran-thi-binh', teamId: 't1' };

function plan(body: string, players: DrawPlayer[] = [AN, BINH], teams: DrawTeam[] = [RED, BLUE]) {
  return planDrawImport({ rows: rowsOf(body), players, teams });
}

describe('parseDrawCsv', () => {
  it('reads the columns in any order and tidies spacing', () => {
    expect(parseDrawCsv('team_name;full_name\n Đội  Đỏ ; Nguyễn Văn Ân\n')).toEqual({
      ok: true,
      rows: [{ line: 2, fullName: 'Nguyễn Văn Ân', teamName: 'Đội Đỏ' }],
    });
  });

  it('rejects an empty file, a missing column and too many rows', () => {
    expect(parseDrawCsv('')).toEqual({ ok: false, error: 'empty' });
    expect(parseDrawCsv('full_name,team\nA,B')).toEqual({ ok: false, error: 'header' });
    const many = Array.from({ length: MAX_DRAW_ROWS + 1 }, (_, i) => `P${i},T`).join('\n');
    expect(parseDrawCsv(`${HEADER}\n${many}`)).toEqual({ ok: false, error: 'tooMany' });
  });

  it('keeps rows with a missing cell for the plan to flag', () => {
    expect(rowsOf('Nguyễn Văn Ân')).toEqual([{ line: 2, fullName: 'Nguyễn Văn Ân', teamName: '' }]);
  });
});

describe('planDrawImport', () => {
  it('assigns players to existing teams, matching team names loosely', () => {
    const result = plan('Nguyễn Văn Ân,đội  xanh\nTrần Thị Bình,ĐỘI ĐỎ');
    expect(result.rows).toEqual([
      { line: 2, kind: 'assign', name: 'Nguyễn Văn Ân', teamName: 'Đội Xanh', fromTeam: null, newTeam: false },
      { line: 3, kind: 'unchanged', name: 'Trần Thị Bình', teamName: 'Đội Đỏ' },
    ]);
    expect(result.assignments).toEqual([{ season_player_id: 's1', team_id: 't2', team_name: 'Đội Xanh' }]);
    expect(result.newTeams).toEqual([]);
    expect(result.counts).toEqual({ assign: 1, unchanged: 1, invalid: 0 });
    expect(result.canApply).toBe(true);
  });

  it('matches players by slug, by name and by name without diacritics', () => {
    const result = plan('nguyen-van-an,Đội Đỏ\nTRẦN THỊ BÌNH,Đội Xanh');
    expect(result.assignments.map((a) => a.season_player_id)).toEqual(['s1', 's2']);
    expect(plan('Nguyen Van An,Đội Đỏ').assignments).toEqual([
      { season_player_id: 's1', team_id: 't1', team_name: 'Đội Đỏ' },
    ]);
  });

  it('creates each new team once, with the first spelling and an unused color', () => {
    const result = plan('Nguyễn Văn Ân,Đội Vàng\nTrần Thị Bình,đội vàng');
    expect(result.newTeams).toEqual([{ name: 'Đội Vàng', color: TEAM_COLORS[2] }]);
    expect(result.assignments).toEqual([
      { season_player_id: 's1', team_id: null, team_name: 'Đội Vàng' },
      { season_player_id: 's2', team_id: null, team_name: 'Đội Vàng' },
    ]);
    expect(result.rows[1]).toMatchObject({ kind: 'assign', fromTeam: 'Đội Đỏ', newTeam: true, teamName: 'Đội Vàng' });
  });

  it('flags bad rows and leaves them out of the writes', () => {
    const twin: DrawPlayer = { id: 's3', fullName: 'Nguyễn Văn Ân', slug: 'nguyen-van-an-2', teamId: null };
    const result = plan(
      [
        ',Đội Đỏ',
        `Trần Thị Bình,${'x'.repeat(MAX_TEAM_NAME_LENGTH + 1)}`,
        'Lê Văn Cường,Đội Đỏ',
        'Nguyễn Văn Ân,Đội Đỏ',
        'Trần Thị Bình,Đội Xanh',
        'tran-thi-binh,Đội Đỏ',
      ].join('\n'),
      [AN, BINH, twin],
    );
    expect(result.rows.map((r) => (r.kind === 'invalid' ? r.errors : r.kind))).toEqual([
      ['fullName'],
      ['teamName'],
      ['unknownPlayer'],
      ['ambiguousPlayer'],
      'assign',
      ['duplicate'],
    ]);
    expect(result.assignments).toEqual([{ season_player_id: 's2', team_id: 't2', team_name: 'Đội Xanh' }]);
    expect(result.counts).toEqual({ assign: 1, unchanged: 0, invalid: 5 });
  });

  it('cannot be applied when nothing changes', () => {
    const result = plan('Trần Thị Bình,Đội Đỏ');
    expect(result.canApply).toBe(false);
    expect(result.newTeams).toEqual([]);
  });
});
