import { teamStats, type SeasonSettings, type StandingsMatch, type TeamStats } from '../domain';
import { matchScore, type MatchCard, type ScheduleMatchInput } from './public-matches';
import { buildStandingsView, type PublicTeam } from './public-standings';

/** A `season_player` as the public team and player pages show them. */
export interface PublicPlayer {
  id: string;
  personId: string;
  slug: string;
  name: string;
  gender: 'male' | 'female';
  avatarUrl: string | null;
  teamId: string | null;
  rank: number;
  skill: number;
  status: 'active' | 'withdrawn';
}

export interface TeamCard {
  team: PublicTeam;
  captain: PublicPlayer | null;
  /** Standings position; null for a disqualified team. */
  position: number | null;
  stats: TeamStats;
}

const NO_STATS: TeamStats = {
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
};

/** Strongest first: active before withdrawn, then rank, skill points (high first) and name. */
export function sortPlayers<T extends Pick<PublicPlayer, 'rank' | 'skill' | 'name' | 'status'>>(players: T[]): T[] {
  return [...players].sort(
    (a, b) =>
      Number(a.status === 'withdrawn') - Number(b.status === 'withdrawn') ||
      a.rank - b.rank ||
      b.skill - a.skill ||
      a.name.localeCompare(b.name, 'vi'),
  );
}

/**
 * The team cards (spec §5 P6), in standings order with disqualified teams last. Records come from
 * `teamStats`, so they match the standings table.
 */
export function buildTeamCards(input: {
  teams: readonly PublicTeam[];
  captains: ReadonlyMap<string, string | null>;
  players: readonly PublicPlayer[];
  matches: readonly StandingsMatch[];
  settings: Pick<SeasonSettings, 'set_target' | 'sets_per_match' | 'knockout_teams'>;
  finalOrder: readonly string[] | null;
}): TeamCard[] {
  const { teams, captains, players, matches, settings, finalOrder } = input;
  const standings = buildStandingsView({ teams, matches, settings, finalOrder });
  const stats = teamStats(matches, settings);
  const playerById = new Map(players.map((p) => [p.id, p]));
  const card = (team: PublicTeam, position: number | null): TeamCard => {
    const captainId = captains.get(team.id);
    return {
      team,
      captain: (captainId && playerById.get(captainId)) || null,
      position,
      stats: stats.get(team.id) ?? NO_STATS,
    };
  };
  return [
    ...standings.rows.map((row) => card(row.team, row.rank)),
    ...standings.disqualified.map((team) => card(team, null)),
  ];
}

/** The team page (spec §5 P6): its roster, strongest first, and its matches in time order. */
export function buildTeamDetail(input: {
  teamId: string;
  players: readonly PublicPlayer[];
  schedule: readonly ScheduleMatchInput[];
  settings: Pick<SeasonSettings, 'set_target' | 'sets_per_match' | 'relay_milestones'>;
}): { roster: PublicPlayer[]; matches: MatchCard[] } {
  const { teamId, players, schedule, settings } = input;
  const roster = sortPlayers(players.filter((p) => p.teamId === teamId));
  const matches = schedule
    .filter((m) => m.home_team_id === teamId || m.away_team_id === teamId)
    // Unscheduled matches go last; ISO timestamps sort as text.
    .sort(
      (a, b) =>
        Number(a.scheduled_at === null) - Number(b.scheduled_at === null) ||
        (a.scheduled_at ?? '').localeCompare(b.scheduled_at ?? '') ||
        a.code.localeCompare(b.code),
    )
    .map((m): MatchCard => ({ ...m, score: matchScore(m, settings) }));
  return { roster, matches };
}
