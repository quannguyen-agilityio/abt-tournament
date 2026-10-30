import {
  computeStandings,
  seedBracket,
  type BracketCode,
  type MatchStatus,
  type SeasonSettings,
  type StandingsMatch,
  type StandingsTeam,
} from '../domain';

/** A group match as the Close-group screen reads it (spec §6 A6). */
export type CloseGroupMatch = StandingsMatch & {
  winner_team_id: string | null;
  slots: readonly { slot_no: number; score_home: number | null; score_away: number | null }[];
};

type Settings = Pick<SeasonSettings, 'set_target' | 'sets_per_match' | 'knockout_teams'>;

/** What `group_closure.manual_draws` stores: each drawn group in its drawn order, and the BTC's note. */
export type ManualDraws = {
  groups: string[][];
  note?: string;
};

export type CloseGroupError =
  /** A group match is still to be played. */
  | 'unfinished'
  /** Fewer teams than the bracket needs. */
  | 'teams'
  /** Teams are drawn by hand, so a note is required. */
  | 'note'
  /** The submitted draw no longer matches the tied teams: the results changed meanwhile. */
  | 'changed';

export type ClosePlan =
  | {
      ok: true;
      finalOrder: string[];
      manualDraws: ManualDraws;
      /** The `p_bracket` of close_group: SF1 and SF2 seeded, 3RD and F empty. */
      bracket: { code: BracketCode; home_team_id: string | null; away_team_id: string | null }[];
    }
  | { ok: false; error: CloseGroupError };

const FINISHED: readonly MatchStatus[] = ['completed', 'forfeit', 'annulled'];

/** Group matches that are neither completed, forfeited nor annulled. */
export function unfinishedGroupMatches<T extends Pick<StandingsMatch, 'stage' | 'status'>>(matches: readonly T[]): T[] {
  return matches.filter((m) => m.stage === 'group' && !FINISHED.includes(m.status));
}

/**
 * The groups of teams still level after step 5 (spec §4.6), each in its current order: the only teams
 * the BTC may order by hand.
 */
export function tiedGroups(
  teams: readonly StandingsTeam[],
  matches: readonly StandingsMatch[],
  settings: Settings,
): string[][] {
  return computeStandings(teams, matches, settings).pendingDraws;
}

/**
 * Checks the BTC's draw against the teams still level and builds what close_group writes: the final
 * order, the manual draws and the seeded bracket (spec §4.6 step 6, §4.8).
 *
 * `drawOrder` lists the tied teams in the order the BTC put them, group after group; only the relative
 * order within each group counts. It must name exactly the tied teams, so a stale page is refused.
 */
export function planGroupClosure(input: {
  teams: readonly StandingsTeam[];
  matches: readonly StandingsMatch[];
  settings: Settings;
  drawOrder: readonly string[];
  note: string;
}): ClosePlan {
  const { teams, matches, settings, drawOrder } = input;
  const note = input.note.trim();
  if (unfinishedGroupMatches(matches).length > 0) return { ok: false, error: 'unfinished' };

  const tied = tiedGroups(teams, matches, settings);
  const tiedIds = tied.flat();
  if (drawOrder.length !== tiedIds.length || new Set(drawOrder).size !== drawOrder.length) {
    return { ok: false, error: 'changed' };
  }
  if (!tiedIds.every((id) => drawOrder.includes(id))) return { ok: false, error: 'changed' };
  if (tied.length > 0 && note === '') return { ok: false, error: 'note' };

  const groups = tied.map((group) => drawOrder.filter((id) => group.includes(id)));
  const result = computeStandings(teams, matches, settings, groups.flat());
  if (result.pendingDraws.length > 0) return { ok: false, error: 'changed' };

  const finalOrder = result.rows.map((row) => row.teamId);
  if (finalOrder.length < settings.knockout_teams) return { ok: false, error: 'teams' };

  return {
    ok: true,
    finalOrder,
    manualDraws: note === '' ? { groups } : { groups, note },
    bracket: seedBracket(finalOrder, settings).map((m) => ({
      code: m.code,
      home_team_id: m.home,
      away_team_id: m.away,
    })),
  };
}

/**
 * The `private.group_result_state` the standings were computed from: every group match with its
 * status, winner and slot scores, and the disqualified teams, each ordered by id. Lowercase uuids sort
 * the same as text here as they do in Postgres.
 */
export function groupResultState(matches: readonly CloseGroupMatch[], teams: readonly StandingsTeam[]) {
  const byId = (a: { id: string }, b: { id: string }) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  return {
    matches: matches
      .filter((m) => m.stage === 'group')
      .sort(byId)
      .map((m) => ({
        id: m.id,
        status: m.status,
        winner_team_id: m.winner_team_id,
        scores: [...m.slots].sort((a, b) => a.slot_no - b.slot_no).map((s) => [s.score_home, s.score_away]),
      })),
    disqualified: teams
      .filter((t) => t.disqualified)
      .sort(byId)
      .map((t) => t.id),
  };
}

/** Reads `group_closure.manual_draws`, which is free JSON in the database. */
export function parseManualDraws(value: unknown): ManualDraws {
  if (typeof value !== 'object' || value === null) return { groups: [] };
  const { groups, note } = value as Record<string, unknown>;
  return {
    groups: Array.isArray(groups)
      ? groups.filter((g): g is string[] => Array.isArray(g) && g.every((id): id is string => typeof id === 'string'))
      : [],
    ...(typeof note === 'string' && note !== '' ? { note } : {}),
  };
}

/**
 * True once a bracket match has moved past `scheduled`, so the group can no longer be reopened. The
 * database also counts attendance and lineups entered on a scheduled match, and has the final say.
 */
export function bracketStarted(matches: readonly Pick<StandingsMatch, 'stage' | 'status'>[]): boolean {
  return matches.some((m) => m.stage !== 'group' && m.status !== 'scheduled');
}
