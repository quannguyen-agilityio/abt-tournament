// Verification (spec §9): the standings the domain code computes from the imported sets, and the
// team totals under the sheet's own convention, must equal what the workbook shows.
import { computeStandings, type StandingsResult, type StandingsRow } from '../../../src/domain/standings';
import { DEFAULT_SEASON_SETTINGS } from '../../../src/domain/settings';
import type { Import2026, TeamTotals } from './model';

const teamKey = (number: number) => String(number);

/** Group standings from the imported group matches, with the default season settings. */
export function computeGroupStandings(data: Import2026): StandingsResult {
  return computeStandings(
    data.teams.map((t) => ({ id: teamKey(t.number) })),
    data.matches
      .filter((m) => m.stage === 'group')
      .map((m) => ({
        id: m.code,
        stage: m.stage,
        status: 'completed' as const,
        home_team_id: teamKey(m.homeTeam),
        away_team_id: teamKey(m.awayTeam),
        slots: m.slots,
      })),
    DEFAULT_SEASON_SETTINGS,
  );
}

/**
 * The `TKV_Doi` convention: over every slot row of every match (relay legs included), a team's sets
 * are the rows it played, won the rows where its recorded score is higher, and its points the sum of
 * the recorded scores (a relay leg's score is the cumulative one).
 */
export function computeTeamTotals(data: Import2026): TeamTotals[] {
  const totals = new Map<number, TeamTotals>(
    data.teams.map((t) => [
      t.number,
      { teamNumber: t.number, sets: 0, won: 0, lost: 0, pointsFor: 0, pointsAgainst: 0, diff: 0 },
    ]),
  );
  for (const m of data.matches) {
    for (const s of m.slots) {
      for (const [team, own, other] of [
        [m.homeTeam, s.score_home, s.score_away],
        [m.awayTeam, s.score_away, s.score_home],
      ] as const) {
        const t = totals.get(team)!;
        t.sets += 1;
        if (own > other) t.won += 1;
        if (own < other) t.lost += 1;
        t.pointsFor += own;
        t.pointsAgainst += other;
        t.diff += own - other;
      }
    }
  }
  return [...totals.values()];
}

function compare<T extends object>(label: string, expected: T | undefined, actual: T | undefined, fields: (keyof T)[]) {
  if (!expected || !actual) return [`${label}: missing from the ${expected ? 'sheet' : 'computed result'}`];
  return fields
    .filter((f) => expected[f] !== actual[f])
    .map((f) => `${label} ${String(f)}: computed ${String(expected[f])}, sheet ${String(actual[f])}`);
}

/** Differences between the computed numbers and the sheet's summary and TKV_Doi; empty means they agree. */
export function verifyImport(data: Import2026): string[] {
  const name = (n: number) => data.teams.find((t) => t.number === n)?.name ?? `team ${n}`;
  const diffs: string[] = [];

  const computed = new Map(computeGroupStandings(data).rows.map((r) => [Number(r.teamId), r]));
  const summary = new Map(data.summary.map((s) => [s.teamNumber, s]));
  for (const t of data.teams) {
    diffs.push(
      ...compare<StandingsRow>(
        `Standings, ${name(t.number)},`,
        computed.get(t.number),
        summary.get(t.number) as StandingsRow | undefined,
        [
          'played',
          'won',
          'lost',
          'setsWon',
          'setsLost',
          'setDiff',
          'pointsFor',
          'pointsAgainst',
          'pointDiff',
          'points',
          'rank',
        ],
      ),
    );
  }

  const totals = new Map(computeTeamTotals(data).map((x) => [x.teamNumber, x]));
  const sheet = new Map(data.teamTotals.map((x) => [x.teamNumber, x]));
  for (const t of data.teams) {
    diffs.push(
      ...compare(`TKV_Doi, ${name(t.number)},`, totals.get(t.number), sheet.get(t.number), [
        'sets',
        'won',
        'lost',
        'pointsFor',
        'pointsAgainst',
        'diff',
      ]),
    );
  }
  return diffs;
}

/** A printable standings table: rank, team and the numbers. */
export function formatStandings(data: Import2026, result: StandingsResult = computeGroupStandings(data)): string {
  const header = ['#', 'Team', 'P', 'W', 'L', 'Sets', 'Set diff', 'Points', 'Pt diff', 'Pts'];
  const rows = result.rows.map((r) =>
    [
      r.rank,
      data.teams.find((t) => t.number === Number(r.teamId))?.name ?? r.teamId,
      r.played,
      r.won,
      r.lost,
      `${r.setsWon}-${r.setsLost}`,
      r.setDiff,
      `${r.pointsFor}-${r.pointsAgainst}`,
      r.pointDiff,
      r.points,
    ].map(String),
  );
  const widths = header.map((h, i) => Math.max(h.length, ...rows.map((r) => r[i].length)));
  const line = (cells: string[]) =>
    cells
      .map((c, i) => c.padEnd(widths[i]))
      .join('  ')
      .trimEnd();
  return [line(header), ...rows.map(line)].join('\n');
}
