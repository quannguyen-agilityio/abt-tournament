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

/** A number the sheet shows that differs from the one computed from the sets. */
export interface Difference {
  source: 'summary' | 'tkv';
  teamNumber: number;
  field: string;
  /** Value in the sheet. */
  sheet: number;
  /** Value computed from the set rows. */
  expected: number;
}

/** A known error in the sheet itself, accepted only while it occurs exactly as written. */
export interface Erratum extends Difference {
  reason: string;
}

/** Errors in the 2026 workbook's own summary formulas (team numbers follow `Xếp Rank`). */
export const SHEET_ERRATA: readonly Erratum[] = [
  {
    source: 'summary',
    teamNumber: 4,
    field: 'pointsFor',
    sheet: 832,
    expected: 865,
    reason: 'AA7/AB7 sum the V16 rows from the home column although team 4 is away in V16',
  },
  {
    source: 'summary',
    teamNumber: 4,
    field: 'pointsAgainst',
    sheet: 766,
    expected: 733,
    reason: 'AA7/AB7 sum the V16 rows from the home column although team 4 is away in V16',
  },
  {
    source: 'summary',
    teamNumber: 4,
    field: 'pointDiff',
    sheet: 66,
    expected: 132,
    reason: 'AA7/AB7 sum the V16 rows from the home column although team 4 is away in V16',
  },
  {
    source: 'summary',
    teamNumber: 3,
    field: 'rank',
    sheet: 2,
    expected: 3,
    reason:
      'the sheet rank formula ignores head-to-head; team 6 won it (spec §4.6 step 2), as Y14:Z17 and the SF2 seeding agree',
  },
  {
    source: 'summary',
    teamNumber: 6,
    field: 'rank',
    sheet: 3,
    expected: 2,
    reason:
      'the sheet rank formula ignores head-to-head; team 6 won it (spec §4.6 step 2), as Y14:Z17 and the SF2 seeding agree',
  },
];

function compare<T extends object>(
  source: Difference['source'],
  teamNumber: number,
  computed: T | undefined,
  sheet: T | undefined,
  fields: (keyof T & string)[],
): Difference[] | string {
  if (!computed || !sheet)
    return `${source}: team ${teamNumber} is missing from the ${computed ? 'sheet' : 'computed result'}`;
  return fields
    .filter((f) => computed[f] !== sheet[f])
    .map((f) => ({ source, teamNumber, field: f, sheet: sheet[f] as number, expected: computed[f] as number }));
}

export interface Verification {
  /** Differences not covered by an erratum, plus errata that no longer occur. */
  failures: string[];
  accepted: Erratum[];
}

/** Every difference between the computed numbers and the sheet's summary and TKV_Doi, or a missing-row message. */
function findDifferences(data: Import2026): (Difference | string)[] {
  const out: (Difference | string)[] = [];
  const computed = new Map(computeGroupStandings(data).rows.map((r) => [Number(r.teamId), r]));
  const summary = new Map(data.summary.map((s) => [s.teamNumber, s]));
  const totals = new Map(computeTeamTotals(data).map((x) => [x.teamNumber, x]));
  const sheet = new Map(data.teamTotals.map((x) => [x.teamNumber, x]));
  const add = (r: Difference[] | string) => out.push(...(typeof r === 'string' ? [r] : r));
  for (const t of data.teams) {
    add(
      compare<StandingsRow>(
        'summary',
        t.number,
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
    add(
      compare('tkv', t.number, totals.get(t.number), sheet.get(t.number), [
        'sets',
        'won',
        'lost',
        'pointsFor',
        'pointsAgainst',
        'diff',
      ]),
    );
  }
  return out;
}

/**
 * Compares the computed numbers with the sheet's summary and TKV_Doi. A difference is accepted only
 * when an erratum matches it exactly (team, field, both values); an erratum that matches nothing fails too.
 */
export function verifyWithErrata(data: Import2026, errata: readonly Erratum[] = []): Verification {
  const name = (n: number) => data.teams.find((t) => t.number === n)?.name ?? `team ${n}`;
  const failures: string[] = [];
  const used = new Set<Erratum>();
  for (const d of findDifferences(data)) {
    if (typeof d === 'string') {
      failures.push(d);
      continue;
    }
    const known = errata.find(
      (e) =>
        e.source === d.source &&
        e.teamNumber === d.teamNumber &&
        e.field === d.field &&
        e.sheet === d.sheet &&
        e.expected === d.expected,
    );
    if (known) used.add(known);
    else
      failures.push(
        `${d.source === 'tkv' ? 'TKV_Doi' : 'Standings'}, ${name(d.teamNumber)}, ${d.field}: computed ${d.expected}, sheet ${d.sheet}`,
      );
  }
  for (const e of errata.filter((x) => !used.has(x))) {
    failures.push(`Erratum no longer occurs: ${e.source} team ${e.teamNumber} ${e.field} (${e.reason})`);
  }
  return { failures, accepted: [...used] };
}

/** Differences that fail the import (no errata); empty means the sheet agrees with the computed numbers. */
export function verifyImport(data: Import2026, errata: readonly Erratum[] = []): string[] {
  return verifyWithErrata(data, errata).failures;
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
