import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import { templateWorkbook, workbookToCsv } from './import-workbook';
import { MAX_IMPORT_ROWS, parsePlayerCsv, playerImportTemplate, REQUIRED_COLUMNS } from './player-import';
import { parseDrawCsv, teamDrawTemplate } from './team-draw';

async function load(data: ArrayBuffer) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(data);
  return workbook;
}

describe('templateWorkbook', () => {
  it('puts each field in its own column with dropdowns from a hidden sheet', async () => {
    const workbook = await load(await templateWorkbook(playerImportTemplate({ maxRank: 6 })));
    const [data, lists] = workbook.worksheets;
    expect(data.getRow(1).values).toEqual([undefined, ...REQUIRED_COLUMNS]);
    expect(data.getRow(2).values).toEqual([undefined, 'Nguyễn Văn Ân', 'male', 1, 0, 'employee']);
    expect(lists.state).toBe('hidden');

    const last = MAX_IMPORT_ROWS + 1;
    expect(data.getCell(`B${last}`).dataValidation).toMatchObject({
      type: 'list',
      formulae: ['lists!$A$2:$A$3'],
      showErrorMessage: true,
    });
    expect(data.getCell(`E${last}`).dataValidation).toMatchObject({ type: 'list', formulae: ['lists!$B$2:$B$4'] });
    expect(data.getCell(`C${last}`).dataValidation).toMatchObject({ type: 'whole', formulae: [1, 6] });
    expect(data.getCell(`A${last}`).dataValidation).toBeUndefined();
    expect(lists.getColumn(2).values).toEqual([undefined, 'member_type', 'employee', 'intern', 'guest']);
  });

  it('leaves out a dropdown that has no values', async () => {
    const workbook = await load(await templateWorkbook(teamDrawTemplate({ players: ['Nguyễn Văn Ân'], teams: [] })));
    const data = workbook.worksheets[0];
    expect(data.getCell('A2').dataValidation).toMatchObject({
      type: 'list',
      formulae: ['lists!$A$2:$A$2'],
      showErrorMessage: true,
    });
    expect(data.getCell('B2').dataValidation).toBeUndefined();
  });
});

describe('workbookToCsv', () => {
  it('turns the downloaded template back into CSV the parser accepts', async () => {
    const csv = await workbookToCsv(await templateWorkbook(playerImportTemplate({ maxRank: 6 })));
    expect(csv).toBe(
      'full_name,gender,rank,skill_points,member_type\nNguyễn Văn Ân,male,1,0,employee\nTrần Thị Bình,female,6,10,intern',
    );
    const result = parsePlayerCsv(csv, { maxRank: 6 });
    expect(result.ok && result.rows.every((r) => r.ok)).toBe(true);
  });

  it('keeps sheet row numbers as line numbers and drops trailing blank rows', async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('data');
    sheet.getCell('A1').value = 'full_name';
    sheet.getCell('B1').value = 'team_name';
    sheet.getCell('A2').value = 'Nguyễn Văn Ân';
    sheet.getCell('B2').value = { richText: [{ text: 'Đội ' }, { text: 'Đỏ, 1' }] };
    sheet.getCell('A4').value = 'Trần Thị Bình';
    sheet.getCell('B4').value = { formula: '"Đội Xanh"', result: 'Đội Xanh' };
    sheet.getCell('A6').value = '';
    const csv = await workbookToCsv((await workbook.xlsx.writeBuffer()) as ArrayBuffer);
    expect(csv).toBe('full_name,team_name\nNguyễn Văn Ân,"Đội Đỏ, 1"\n\nTrần Thị Bình,Đội Xanh');
    expect(parseDrawCsv(csv)).toEqual({
      ok: true,
      rows: [
        { line: 2, fullName: 'Nguyễn Văn Ân', teamName: 'Đội Đỏ, 1' },
        { line: 4, fullName: 'Trần Thị Bình', teamName: 'Đội Xanh' },
      ],
    });
  });

  it('reads the first visible sheet', async () => {
    const workbook = new ExcelJS.Workbook();
    workbook.addWorksheet('old', { state: 'hidden' }).getCell('A1').value = 'old';
    workbook.addWorksheet('data').getCell('A1').value = 'full_name';
    expect(await workbookToCsv((await workbook.xlsx.writeBuffer()) as ArrayBuffer)).toBe('full_name');
  });
});
