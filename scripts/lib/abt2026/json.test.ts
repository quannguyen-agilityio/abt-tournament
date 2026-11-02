import { describe, expect, it } from 'vitest';
import { fakeSheets } from './fixture';
import { parseImportJson, toImportJson } from './json';
import { ImportError, parseWorkbook } from './parse';

const data = parseWorkbook(fakeSheets()).data;

describe('import JSON', () => {
  it('round-trips without the fees', () => {
    const json = toImportJson(data);
    expect(json).not.toContain('"fee"');
    expect(json.startsWith('{\n  "$comment"')).toBe(true);
    expect(json.endsWith('}\n')).toBe(true);
    const expected = { ...data, players: data.players.map((p) => ({ ...p, fee: undefined })) };
    expect(parseImportJson(json)).toEqual(expected);
  });

  it('rejects a wrong type, naming the path', () => {
    const doc = JSON.parse(toImportJson(data));
    doc.matches[0].round = 'one';
    expect(() => parseImportJson(JSON.stringify(doc))).toThrow(ImportError);
    expect(() => parseImportJson(JSON.stringify(doc))).toThrow(/matches\.0\.round/);
  });

  it('rejects an unknown key', () => {
    const doc = JSON.parse(toImportJson(data));
    doc.teams[0].extra = 1;
    expect(() => parseImportJson(JSON.stringify(doc))).toThrow(/teams\.0/);
  });

  it('rejects text that is not JSON', () => {
    expect(() => parseImportJson('{')).toThrow(ImportError);
  });
});
