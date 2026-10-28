import {
  computeStandings,
  type SeasonSettings,
  type StandingsCriterion,
  type StandingsMatch,
  type StandingsRow,
} from '../domain';

export interface PublicTeam {
  id: string;
  name: string;
  color: string;
  disqualifiedReason: string | null;
  disqualified: boolean;
}

/** What decided a team's position, minus plain points. `draw_pending` = the draw is not made yet. */
export type StandingsHint = Exclude<StandingsCriterion, 'points'> | 'draw_pending';

export interface StandingsViewRow extends StandingsRow {
  team: PublicTeam;
  qualifies: boolean;
  hint: StandingsHint | null;
}

export interface StandingsView {
  /** The group is closed (a `group_closure` row exists): the order is final. */
  closed: boolean;
  rows: StandingsViewRow[];
  qualifyingCount: number;
  /** Disqualified teams, in input order. */
  disqualified: PublicTeam[];
  /** Group matches completed or forfeited. */
  groupPlayed: number;
  /** Group matches that are not annulled. */
  groupTotal: number;
}

/** The public standings table (spec §5 P2): the domain standings plus what the page shows. */
export function buildStandingsView(input: {
  teams: readonly PublicTeam[];
  matches: readonly StandingsMatch[];
  settings: Pick<SeasonSettings, 'set_target' | 'sets_per_match' | 'knockout_teams'>;
  finalOrder: readonly string[] | null;
}): StandingsView {
  const { teams, matches, settings, finalOrder } = input;
  const closed = finalOrder !== null;
  const result = computeStandings(
    teams.map((t) => ({ id: t.id, disqualified: t.disqualified })),
    matches,
    settings,
    finalOrder ?? [],
  );

  let ordered = result.rows;
  if (finalOrder) {
    const at = new Map(finalOrder.map((id, i) => [id, i]));
    // Array.sort is stable: teams missing from the final order keep their computed order, after the rest.
    ordered = [...result.rows].sort((a, b) => (at.get(a.teamId) ?? Infinity) - (at.get(b.teamId) ?? Infinity));
  }

  const byId = new Map(teams.map((t) => [t.id, t]));
  const pending = new Set(result.pendingDraws.flat());
  const rows = ordered.map((row, i): StandingsViewRow => {
    const rank = i + 1;
    const hint: StandingsHint | null =
      row.decidedBy === 'points'
        ? null
        : row.decidedBy === 'draw' && !closed && pending.has(row.teamId)
          ? 'draw_pending'
          : row.decidedBy;
    return { ...row, rank, team: byId.get(row.teamId)!, qualifies: rank <= settings.knockout_teams, hint };
  });

  const group = matches.filter((m) => m.stage === 'group' && m.status !== 'annulled');
  return {
    closed,
    rows,
    qualifyingCount: settings.knockout_teams,
    disqualified: teams.filter((t) => t.disqualified),
    groupPlayed: group.filter((m) => m.status === 'completed' || m.status === 'forfeit').length,
    groupTotal: group.length,
  };
}
