// Import files as Excel workbooks (#110): one column per field and dropdowns for the enum fields. A CSV
// cannot carry dropdowns, and Excel set to a Vietnamese locale opens a comma CSV as one column.
// The importers still take CSV text: a workbook is turned back into CSV before preview.
// Load this module with `import()` so exceljs is fetched only when a template or workbook is used.
import ExcelJS from 'exceljs';
import { toCsv } from './player-import';

export type TemplateColumn = {
  header: string;
  /** Dropdown values. `strict` rejects anything else; otherwise the list only suggests. */
  list?: { values: readonly string[]; strict: boolean };
  /** Whole numbers from `min` to `max`. */
  whole?: { min: number; max: number };
};

/** A ready-to-fill import file: `rows` are example rows, `maxRows` how many rows get the validations. */
export type ImportTemplate = { columns: TemplateColumn[]; rows: (string | number)[][]; maxRows: number };

export const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

const DATA_SHEET = 'data';
/** Hidden sheet holding the dropdown values: an inline list is capped at 255 characters. */
const LIST_SHEET = 'lists';

/** exceljs has range validations but leaves them out of its types. */
type WithDataValidations = ExcelJS.Worksheet & {
  dataValidations: { add(range: string, validation: ExcelJS.DataValidation): void };
};

export async function templateWorkbook(template: ImportTemplate): Promise<ArrayBuffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(DATA_SHEET, { views: [{ state: 'frozen', ySplit: 1 }] });
  const lists = workbook.addWorksheet(LIST_SHEET, { state: 'hidden' });

  sheet.columns = template.columns.map((column, i) => ({
    header: column.header,
    width:
      Math.max(
        column.header.length,
        ...(column.list?.values ?? []).map((v) => v.length),
        ...template.rows.map((row) => String(row[i] ?? '').length),
      ) + 4,
  }));
  sheet.getRow(1).font = { bold: true };
  sheet.addRows(template.rows);

  let listColumn = 0;
  template.columns.forEach((column, i) => {
    let validation: ExcelJS.DataValidation | undefined;
    if (column.list && column.list.values.length > 0) {
      listColumn += 1;
      const values = column.list.values;
      lists.getCell(1, listColumn).value = column.header;
      values.forEach((value, j) => (lists.getCell(j + 2, listColumn).value = value));
      const letter = lists.getColumn(listColumn).letter;
      validation = {
        type: 'list',
        allowBlank: true,
        formulae: [`${LIST_SHEET}!$${letter}$2:$${letter}$${values.length + 1}`],
        showErrorMessage: column.list.strict,
      };
    } else if (column.whole) {
      validation = {
        type: 'whole',
        operator: 'between',
        allowBlank: true,
        formulae: [column.whole.min, column.whole.max],
        showErrorMessage: true,
      };
    }
    if (!validation) return;
    // One range per column: per-cell validations come out as overlapping ranges, as exceljs sorts the
    // addresses as text ("B10" before "B2").
    const letter = sheet.getColumn(i + 1).letter;
    (sheet as WithDataValidations).dataValidations.add(`${letter}2:${letter}${template.maxRows + 1}`, validation);
  });

  return workbook.xlsx.writeBuffer() as Promise<ArrayBuffer>;
}

/**
 * CSV text of the workbook's first visible sheet. Blank rows stay as blank lines, so the line numbers of
 * the preview are the sheet's row numbers.
 */
export async function workbookToCsv(data: ArrayBuffer): Promise<string> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(data);
  const sheet = workbook.worksheets.find((ws) => ws.state === 'visible');
  if (!sheet) return '';

  const rows: string[][] = [];
  for (let r = 1; r <= sheet.rowCount; r++) {
    const row = sheet.getRow(r);
    const cells: string[] = [];
    for (let c = 1; c <= row.cellCount; c++) cells.push(row.getCell(c).text);
    rows.push(cells.some((cell) => cell.trim() !== '') ? cells : []);
  }
  while (rows.length > 0 && rows[rows.length - 1].length === 0) rows.pop();
  return toCsv(rows);
}
