// Fails when messages/vi.json and messages/en.json have different keys or empty values.
import { readFileSync } from 'node:fs';
import { diffKeys, flattenKeys } from './lib/message-keys.mjs';

const load = (locale) =>
  flattenKeys(JSON.parse(readFileSync(new URL(`../messages/${locale}.json`, import.meta.url), 'utf8')));

const vi = load('vi');
const en = load('en');
const { missingInVi, missingInEn } = diffKeys(vi.keys, en.keys);

const problems = [
  ...missingInEn.map((k) => `missing in en.json: ${k}`),
  ...missingInVi.map((k) => `missing in vi.json: ${k}`),
  ...vi.empty.map((k) => `empty value in vi.json: ${k}`),
  ...en.empty.map((k) => `empty value in en.json: ${k}`),
];

if (problems.length > 0) {
  console.error(problems.join('\n'));
  console.error(`\ni18n:check failed with ${problems.length} problem(s).`);
  process.exit(1);
}
console.log(`i18n:check ok (${vi.keys.length} keys).`);
