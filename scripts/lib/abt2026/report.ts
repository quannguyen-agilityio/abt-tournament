// Console output shared by import-2026 and convert-2026.
import type { Import2026 } from './model';
import { computeGroupStandings, formatStandings, SHEET_ERRATA, verifyWithErrata } from './verify';

/** Counts, parse notes (xlsx only) and the computed standings. */
export function printRead(data: Import2026, notes: readonly string[] = []): void {
  console.log(
    `Read ${data.teams.length} teams, ${data.players.length} players, ${data.matches.length} matches, ${data.awards.length} awards.`,
  );
  if (notes.length > 0) console.log(`Fixes applied:\n${notes.map((n) => `  - ${n}`).join('\n')}`);
  console.log(`\nComputed standings:\n${formatStandings(data, computeGroupStandings(data))}\n`);
}

/** Verifies against the sheet numbers; returns the failure message, or null when it passed. */
export function verifyAndPrint(data: Import2026): string | null {
  const { failures, accepted } = verifyWithErrata(data, SHEET_ERRATA);
  if (failures.length > 0)
    return `Verification FAILED, nothing was written:\n${failures.map((d) => `  - ${d}`).join('\n')}`;
  if (accepted.length > 0) {
    const lines = accepted.map(
      (e) => `  - ${e.source} team ${e.teamNumber} ${e.field}: sheet ${e.sheet}, computed ${e.expected} (${e.reason})`,
    );
    console.log(`Accepted errors in the sheet:\n${lines.join('\n')}`);
  }
  console.log('Verification passed: standings and team totals match the workbook.');
  return null;
}
