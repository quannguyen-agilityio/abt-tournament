// One-off converter: pnpm convert:2026 --file <ABT_2026.xlsx> [--out data/abt-2026.json]
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { parseArgs } from 'node:util';
import { format, resolveConfig } from 'prettier';
import { toImportJson } from './lib/abt2026/json';
import { ImportError, parseWorkbook } from './lib/abt2026/parse';
import { printRead, verifyAndPrint } from './lib/abt2026/report';
import { readWorkbook } from './lib/abt2026/xlsx';

const USAGE = 'Usage: pnpm convert:2026 --file <ABT_2026.xlsx> [--out data/abt-2026.json]';

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

async function main() {
  const { values } = parseArgs({
    options: { file: { type: 'string' }, out: { type: 'string', default: 'data/abt-2026.json' } },
  });
  if (!values.file) fail(USAGE);

  let parsed;
  try {
    parsed = parseWorkbook(await readWorkbook(values.file));
  } catch (e) {
    if (e instanceof ImportError) fail(e.message);
    throw e;
  }
  printRead(parsed.data, parsed.notes);
  const failure = verifyAndPrint(parsed.data);
  if (failure) fail(failure);

  mkdirSync(dirname(values.out), { recursive: true });
  // Prettier-formatted, so `pnpm format:check` passes on the committed file.
  const options = { ...(await resolveConfig(values.out)), filepath: values.out };
  writeFileSync(values.out, await format(toImportJson(parsed.data), options));
  console.log(`\nWrote ${values.out}`);
}

main().catch((e) => fail(e instanceof Error ? e.message : String(e)));
