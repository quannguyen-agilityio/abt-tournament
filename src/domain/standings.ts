// Standings (spec §4.6, A2): the group table and its tie-breaks.
import { groupForfeit, type MatchStage, type MatchStatus } from './forfeit';
import type { Score, SlotScore } from './score';
import type { SeasonSettings } from './settings';

export interface StandingsTeam {
  id: string;
  /** Disqualified in the group stage: left out of the table and listed below it (A4). */
  disqualified?: boolean;
}

/** The `match` columns and `match_slot` scores the standings read. */
export interface StandingsMatch {
  id: string;
  stage: MatchStage;
  status: MatchStatus;
  home_team_id: string | null;
  away_team_id: string | null;
  /** The team that loses by forfeit; its scores come from `groupForfeit`, not the slots. */
  forfeit_team_id?: string | null;
  /** Final set scores, start points included (D14). */
  slots: readonly SlotScore[];
}

/** What decided a team's position, for the UI hint (e.g. "ahead on head-to-head"). */
export type StandingsCriterion =
  'points' | 'head_to_head' | 'mini_points' | 'mini_set_diff' | 'mini_point_diff' | 'set_diff' | 'point_diff' | 'draw';

export interface TeamStats {
  played: number;
  won: number;
  lost: number;
  /** Points = matches won. */
  points: number;
  setsWon: number;
  setsLost: number;
  setDiff: number;
  pointsFor: number;
  pointsAgainst: number;
  pointDiff: number;
}

export interface StandingsRow extends TeamStats {
  teamId: string;
  /** 1-based position in the table. */
  rank: number;
  decidedBy: StandingsCriterion;
}

export interface StandingsResult {
  rows: StandingsRow[];
  /** Disqualified team ids, in input order, shown below the table. */
  disqualified: string[];
  /** Groups of teams still level after every criterion that `manualDraw` does not fully order. */
  pendingDraws: string[][];
}

/** A counted match, reduced to its result. */
interface MatchResult {
  home: string;
  away: string;
  setsWon: Score;
  points: Score;
  winner: string;
}

const COUNTED: readonly MatchStatus[] = ['completed', 'forfeit'];

const emptyStats = (): TeamStats => ({
  played: 0,
  won: 0,
  lost: 0,
  points: 0,
  setsWon: 0,
  setsLost: 0,
  setDiff: 0,
  pointsFor: 0,
  pointsAgainst: 0,
  pointDiff: 0,
});

function readResult(
  match: StandingsMatch,
  settings: Pick<SeasonSettings, 'set_target' | 'sets_per_match'>,
): MatchResult | null {
  const { home_team_id: home, away_team_id: away } = match;
  if (home === null || away === null) return null;

  if (match.status === 'forfeit' && match.forfeit_team_id) {
    const forfeit = groupForfeit(match.forfeit_team_id === home ? 'home' : 'away', settings);
    return {
      home,
      away,
      setsWon: forfeit.setsWon,
      points: forfeit.points,
      winner: forfeit.winner === 'home' ? home : away,
    };
  }

  const setsWon: Score = { home: 0, away: 0 };
  const points: Score = { home: 0, away: 0 };
  for (const slot of match.slots) {
    if (slot.score_home === null || slot.score_away === null) continue;
    points.home += slot.score_home;
    points.away += slot.score_away;
    if (slot.score_home !== slot.score_away) setsWon[slot.score_home > slot.score_away ? 'home' : 'away'] += 1;
  }
  // Sets won decide the match; there are no draws, so a level count is not a result.
  if (setsWon.home === setsWon.away) return null;
  return { home, away, setsWon, points, winner: setsWon.home > setsWon.away ? home : away };
}

/** Totals per team over `results`, counting only teams in `ids`. */
function tally(ids: readonly string[], results: readonly MatchResult[]): Map<string, TeamStats> {
  const stats = new Map(ids.map((id) => [id, emptyStats()]));
  for (const r of results) {
    const home = stats.get(r.home);
    const away = stats.get(r.away);
    if (!home || !away) continue;
    for (const [s, own, opp] of [
      [home, 'home', 'away'],
      [away, 'away', 'home'],
    ] as const) {
      s.played += 1;
      s.setsWon += r.setsWon[own];
      s.setsLost += r.setsWon[opp];
      s.pointsFor += r.points[own];
      s.pointsAgainst += r.points[opp];
    }
    const [winner, loser] = r.winner === r.home ? [home, away] : [away, home];
    winner.won += 1;
    winner.points += 1;
    loser.lost += 1;
  }
  for (const s of stats.values()) {
    s.setDiff = s.setsWon - s.setsLost;
    s.pointDiff = s.pointsFor - s.pointsAgainst;
  }
  return stats;
}

type Key = (id: string) => number;
interface Step {
  criterion: StandingsCriterion;
  key: Key;
}

/** Each team in its final order, with the criterion that fixed its position. */
type Placed = { id: string; decidedBy: StandingsCriterion }[];

/**
 * Orders `ids` by the first step's key (higher first). A team alone on its value is decided by
 * that step; teams still level go on to the next steps. `level` places teams that no step splits.
 */
function splitBy(ids: readonly string[], steps: readonly Step[], level: (ids: string[]) => Placed): Placed {
  if (steps.length === 0) return level([...ids]);
  const [{ criterion, key }, ...rest] = steps;
  const sorted = [...ids].sort((a, b) => key(b) - key(a));
  const placed: Placed = [];
  for (let i = 0; i < sorted.length;) {
    let j = i + 1;
    while (j < sorted.length && key(sorted[j]) === key(sorted[i])) j += 1;
    const group = sorted.slice(i, j);
    placed.push(...(group.length === 1 ? [{ id: group[0], decidedBy: criterion }] : splitBy(group, rest, level)));
    i = j;
  }
  return placed;
}

/**
 * Group-stage standings (spec §4.6). Only `completed` and `forfeit` group matches count; annulled
 * matches and matches of disqualified teams do not. The ranking order:
 *
 * 1. Points.
 * 2. Two teams level: their head-to-head result.
 * 3. Three or more teams level: one pass of the mini-table among them (head-to-head points →
 *    set difference → point difference), never re-applied to a subgroup still level (A2).
 * 4. Overall set difference, 5. overall point difference.
 * 6. The draw: teams still level follow `manualDraw` (team ids in drawn order), else input order,
 *    and are listed in `pendingDraws` until `manualDraw` orders them all.
 */
export function computeStandings(
  teams: readonly StandingsTeam[],
  matches: readonly StandingsMatch[],
  settings: Pick<SeasonSettings, 'set_target' | 'sets_per_match'>,
  manualDraw: readonly string[] = [],
): StandingsResult {
  const active = teams.filter((t) => !t.disqualified).map((t) => t.id);
  const activeSet = new Set(active);
  const results = matches
    .filter((m) => m.stage === 'group' && COUNTED.includes(m.status))
    .map((m) => readResult(m, settings))
    .filter((r): r is MatchResult => r !== null && activeSet.has(r.home) && activeSet.has(r.away));
  const overall = tally(active, results);

  const inputOrder = new Map(active.map((id, i) => [id, i]));
  const drawOrder = new Map(manualDraw.map((id, i) => [id, i]));
  const pendingDraws: string[][] = [];
  const draw = (ids: string[]): Placed => {
    if (!ids.every((id) => drawOrder.has(id))) pendingDraws.push(ids);
    const at = (id: string) => drawOrder.get(id) ?? manualDraw.length + inputOrder.get(id)!;
    return [...ids].sort((a, b) => at(a) - at(b)).map((id) => ({ id, decidedBy: 'draw' as const }));
  };

  const stat =
    (stats: Map<string, TeamStats>, field: keyof TeamStats): Key =>
    (id) =>
      stats.get(id)![field];
  const overallSteps: Step[] = [
    { criterion: 'set_diff', key: stat(overall, 'setDiff') },
    { criterion: 'point_diff', key: stat(overall, 'pointDiff') },
  ];

  const levelOnPoints = (ids: string[]): Placed => {
    const mini = tally(ids, results);
    const steps: Step[] =
      ids.length === 2
        ? [{ criterion: 'head_to_head', key: stat(mini, 'points') }]
        : [
            { criterion: 'mini_points', key: stat(mini, 'points') },
            { criterion: 'mini_set_diff', key: stat(mini, 'setDiff') },
            { criterion: 'mini_point_diff', key: stat(mini, 'pointDiff') },
          ];
    // Teams the head-to-head step leaves level skip straight to the overall steps (A2).
    return splitBy(ids, steps, (still) => splitBy(still, overallSteps, draw));
  };

  const placed = splitBy(active, [{ criterion: 'points', key: stat(overall, 'points') }], levelOnPoints);
  return {
    rows: placed.map(({ id, decidedBy }, i) => ({ teamId: id, rank: i + 1, decidedBy, ...overall.get(id)! })),
    disqualified: teams.filter((t) => t.disqualified).map((t) => t.id),
    pendingDraws,
  };
}
