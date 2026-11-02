#!/usr/bin/env node
// PostToolUse hook: format .md files with Prettier after Write/Edit.
// Reads the hook payload from stdin; never blocks the tool call.

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const MD_EXTENSIONS = new Set(['.md', '.markdown', '.mdx']);
const IS_WIN = process.platform === 'win32';

function readPayload() {
  try {
    return JSON.parse(readFileSync(0, 'utf8'));
  } catch {
    return null;
  }
}

function run(cmd, args) {
  return spawnSync(cmd, args, { encoding: 'utf8', shell: IS_WIN });
}

// Candidates in priority order: the Prettier installed closest to the file
// (so each sub-project's version and config win), one on PATH, then npx.
function* prettierCandidates(filePath, stopDir) {
  const bin = IS_WIN ? 'prettier.cmd' : 'prettier';
  let dir = path.dirname(filePath);
  while (true) {
    const local = path.join(dir, 'node_modules', '.bin', bin);
    if (existsSync(local)) yield [local];
    const parent = path.dirname(dir);
    if (dir === stopDir || parent === dir) break;
    dir = parent;
  }
  yield [bin];
  yield [IS_WIN ? 'npx.cmd' : 'npx', '--yes', 'prettier@3'];
}

function findPrettier(filePath, stopDir) {
  for (const [cmd, ...args] of prettierCandidates(filePath, stopDir)) {
    if (run(cmd, [...args, '--version']).status === 0) return [cmd, args];
  }
  return null;
}

const payload = readPayload();
const filePath = payload?.tool_input?.file_path;
if (!filePath || !MD_EXTENSIONS.has(path.extname(filePath).toLowerCase()))
  process.exit(0);
if (!existsSync(filePath)) process.exit(0);

const projectDir = path.resolve(
  process.env.CLAUDE_PROJECT_DIR || payload.cwd || process.cwd(),
);
const prettier = findPrettier(path.resolve(filePath), projectDir);
if (!prettier) {
  console.error('format-markdown: Prettier not found, skipping.');
  process.exit(0);
}

const [cmd, args] = prettier;
const result = run(cmd, [...args, '--write', filePath]);
if (result.status !== 0) {
  console.error(
    `format-markdown: Prettier failed on ${filePath}\n${result.stderr || result.error || ''}`,
  );
}
process.exit(0);
