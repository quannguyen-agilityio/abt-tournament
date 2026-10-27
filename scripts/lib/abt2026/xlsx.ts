// Reads the ABT 2026 workbook into plain grids, so the parser never touches exceljs.
import ExcelJS from 'exceljs';

export type CellValue = string | number | null;

/** A sheet reduced to what the parser reads: cells by A1 address and the last used row. */
export interface Grid {
  get(addr: string): CellValue;
  maxRow: number;
}

/** A grid from a plain `{ A1: value }` object, for tests. */
export function gridFromCells(cells: Record<string, CellValue>): Grid {
  let maxRow = 0;
  for (const addr of Object.keys(cells)) maxRow = Math.max(maxRow, Number(addr.replace(/^[A-Z]+/, '')));
  return {
    get: (addr) => {
      const v = cells[addr];
      return v === undefined ? null : v;
    },
    maxRow,
  };
}

/** Excel day 0 (1899-12-30). */
const EXCEL_EPOCH_MS = Date.UTC(1899, 11, 30);

function plain(value: ExcelJS.CellValue): CellValue {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return value;
  if (typeof value === 'string') return value.trim() === '' ? null : value.trim();
  if (typeof value === 'boolean') return value ? 1 : 0;
  // Dates and times become Excel serial numbers (a time of day is the fraction).
  if (value instanceof Date) return (value.getTime() - EXCEL_EPOCH_MS) / 86_400_000;
  if ('richText' in value) return plain(value.richText.map((r) => r.text).join(''));
  if ('result' in value) return plain(value.result as ExcelJS.CellValue);
  if ('text' in value) return plain(String(value.text));
  return null;
}

/** Loads every sheet; formula cells give their cached result, rich text its concatenated text. */
export async function readWorkbook(file: string): Promise<Record<string, Grid>> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(file);
  const sheets: Record<string, Grid> = {};
  for (const ws of wb.worksheets) {
    sheets[ws.name] = {
      get: (addr) => plain(ws.getCell(addr).value),
      maxRow: ws.rowCount,
    };
  }
  return sheets;
}
