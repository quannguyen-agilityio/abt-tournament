// ABT 2026 import (spec §9): pnpm import:2026 --file <xlsx> --env <local|staging|prod> [--dry-run] [--yes]
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '../src/lib/database.types';
import { ImportError, parseWorkbook } from './lib/abt2026/parse';
import { syncImport, type Change } from './lib/abt2026/sync';
import { computeGroupStandings, formatStandings, SHEET_ERRATA, verifyWithErrata } from './lib/abt2026/verify';
import { readWorkbook } from './lib/abt2026/xlsx';

const USAGE = 'Usage: pnpm import:2026 --file <ABT_2026.xlsx> --env <local|staging|prod> [--dry-run] [--yes]';

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

/** KEY=value or KEY="value" lines. */
function parseEnv(text: string): Record<string, string> {
  const env: Record<string, string> = {};
  for (const line of text.split('\n')) {
    const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
    if (m) env[m[1]] = m[2].replace(/^(["'])(.*)\1$/, '$2');
  }
  return env;
}

function credentials(target: string): { url: string; key: string } {
  if (target === 'local') {
    const out = execFileSync('pnpm', ['exec', 'supabase', 'status', '-o', 'env'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    const env = parseEnv(out);
    if (!env.API_URL || !env.SERVICE_ROLE_KEY)
      fail('Could not read API_URL and SERVICE_ROLE_KEY: is `pnpm db:start` running?');
    return { url: env.API_URL, key: env.SERVICE_ROLE_KEY };
  }
  const file = `.env.${target}.local`;
  if (!existsSync(file)) fail(`${file} not found`);
  const env = parseEnv(readFileSync(file, 'utf8'));
  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    fail(`${file} needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY`);
  }
  return { url: env.NEXT_PUBLIC_SUPABASE_URL, key: env.SUPABASE_SERVICE_ROLE_KEY };
}

function summarize(changes: readonly Change[]): string[] {
  const tables = [...new Set(changes.map((c) => c.table))];
  if (tables.length === 0) return ['  nothing to change'];
  return tables.map((t) => {
    const mine = changes.filter((c) => c.table === t);
    return `  ${t}: ${mine.filter((c) => c.action === 'insert').length} inserted, ${mine.filter((c) => c.action === 'update').length} updated`;
  });
}

async function main() {
  const { values } = parseArgs({
    options: {
      file: { type: 'string' },
      env: { type: 'string' },
      'dry-run': { type: 'boolean', default: false },
      yes: { type: 'boolean', default: false },
    },
  });
  const target = values.env;
  if (!values.file || !target || !['local', 'staging', 'prod'].includes(target)) fail(USAGE);
  const dryRun = values['dry-run'];

  // Parse and verify before anything is written.
  let parsed;
  try {
    parsed = parseWorkbook(await readWorkbook(values.file));
  } catch (e) {
    if (e instanceof ImportError) fail(e.message);
    throw e;
  }
  const { data, notes } = parsed;
  console.log(
    `Read ${data.teams.length} teams, ${data.players.length} players, ${data.matches.length} matches, ${data.awards.length} awards.`,
  );
  if (notes.length > 0) console.log(`Fixes applied:\n${notes.map((n) => `  - ${n}`).join('\n')}`);
  console.log(`\nComputed standings:\n${formatStandings(data, computeGroupStandings(data))}\n`);
  const { failures, accepted } = verifyWithErrata(data, SHEET_ERRATA);
  if (failures.length > 0)
    fail(`Verification FAILED, nothing was written:\n${failures.map((d) => `  - ${d}`).join('\n')}`);
  if (accepted.length > 0) {
    const lines = accepted.map(
      (e) => `  - ${e.source} team ${e.teamNumber} ${e.field}: sheet ${e.sheet}, computed ${e.expected} (${e.reason})`,
    );
    console.log(`Accepted errors in the sheet:\n${lines.join('\n')}`);
  }
  console.log('Verification passed: standings and team totals match the workbook.');

  // Connect.
  const { url, key } = credentials(target);
  console.log(`\nTarget: ${target} (${url})${dryRun ? ' [dry run]' : ''}`);
  if (target !== 'local' && !dryRun && !values.yes) fail('Writing to a remote database needs --yes.');
  const client = createClient<Database>(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  const result = await syncImport(client, data, { dryRun });
  console.log(`\n${dryRun ? 'Would change' : 'Changed'}:\n${summarize(result.changes).join('\n')}`);
  if (result.warnings.length > 0) console.log(`\nWarnings:\n${result.warnings.map((w) => `  - ${w}`).join('\n')}`);

  if (!dryRun) {
    const again = await syncImport(client, data, { dryRun: true });
    if (again.changes.length > 0) fail(`A second run would still change:\n${summarize(again.changes).join('\n')}`);
    console.log('\nRe-run would change nothing.');
  }
}

main().catch((e) => fail(e instanceof Error ? e.message : String(e)));
