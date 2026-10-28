import {
  groupForfeit,
  knockoutForfeit,
  type MatchStage,
  type MatchStatus,
  type SeasonSettings,
  type Side,
  type SlotScore,
} from '../domain';
import { isIsoDate } from './season-admin';
import { scheduleGrid, type ScheduleDay } from './schedule';

/** The `match` columns and `match_slot` scores the schedule reads. */
export interface ScheduleMatchInput {
  id: string;
  code: string;
  stage: MatchStage;
  round: number | null;
  status: MatchStatus;
  home_team_id: string | null;
  away_team_id: string | null;
  forfeit_team_id: string | null;
  winner_team_id: string | null;
  scheduled_at: string | null;
  court_id: string | null;
  slots: readonly SlotScore[];
}

/** Group: sets won. Knock-out: the relay scoreboard. `null` before the first score. */
export interface MatchScore {
  home: number;
  away: number;
  winner: Side | null;
}

export interface MatchCard extends ScheduleMatchInput {
  score: MatchScore | null;
}

export type StageFilter = 'group' | 'ko';

/** P3 filters, kept in the URL. `null` means "all". */
export interface MatchFilters {
  day: string | null;
  team: string | null;
  court: string | null;
  stage: StageFilter | null;
}

const scored = (slots: readonly SlotScore[]) =>
  [...slots]
    .filter((s) => s.score_home !== null && s.score_away !== null)
    .sort((a, b) => a.slot_no - b.slot_no) as (SlotScore & { score_home: number; score_away: number })[];

const sideOf = (match: Pick<ScheduleMatchInput, 'home_team_id' | 'away_team_id'>, teamId: string | null) =>
  teamId === null ? null : teamId === match.home_team_id ? 'home' : teamId === match.away_team_id ? 'away' : null;

/**
 * The score a match card shows (spec §5 P3): sets won in the group, the cumulative relay
 * scoreboard in the knock-out. A forfeit shows its recorded result: 5–0 in sets (§4.5) or 125–0 (A5).
 */
export function matchScore(
  match: Pick<
    ScheduleMatchInput,
    'stage' | 'status' | 'home_team_id' | 'away_team_id' | 'forfeit_team_id' | 'winner_team_id' | 'slots'
  >,
  settings: Pick<SeasonSettings, 'set_target' | 'sets_per_match' | 'relay_milestones'>,
): MatchScore | null {
  const forfeitSide = match.status === 'forfeit' ? sideOf(match, match.forfeit_team_id) : null;
  if (forfeitSide) {
    if (match.stage === 'group') {
      const result = groupForfeit(forfeitSide, settings);
      return { ...result.setsWon, winner: result.winner };
    }
    const result = knockoutForfeit(forfeitSide, settings);
    return { ...result.score, winner: result.winner };
  }

  const slots = scored(match.slots);
  if (slots.length === 0) return null;
  const winner = sideOf(match, match.winner_team_id);
  if (match.stage === 'group') {
    const home = slots.filter((s) => s.score_home > s.score_away).length;
    return { home, away: slots.length - home, winner };
  }
  const last = slots.at(-1)!;
  return { home: last.score_home, away: last.score_away, winner };
}

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value) ?? '';

/** Reads the filters from the query string. Unknown or malformed values fall back to "all". */
export function parseMatchFilters(
  query: Record<string, string | string[] | undefined>,
  known: { teamIds: readonly string[]; courtIds: readonly string[] },
): MatchFilters {
  const day = first(query.day);
  const team = first(query.team);
  const court = first(query.court);
  const stage = first(query.stage);
  return {
    day: isIsoDate(day) ? day : null,
    team: known.teamIds.includes(team) ? team : null,
    court: known.courtIds.includes(court) ? court : null,
    stage: stage === 'group' || stage === 'ko' ? stage : null,
  };
}

/** The query string for `filters`, without the "all" ones. */
export function filtersToQuery(filters: MatchFilters): Record<string, string> {
  return Object.fromEntries(Object.entries(filters).filter(([, value]) => value !== null)) as Record<string, string>;
}

/** Local days that have a match or are season match days, in order. */
export function scheduleDays(
  matches: readonly Pick<ScheduleMatchInput, 'id' | 'scheduled_at'>[],
  matchDays: readonly string[],
  timeZone: string,
): string[] {
  return scheduleGrid(matches, matchDays, timeZone).days.map((d) => d.date);
}

/**
 * The public schedule (spec §5 P3): matches filtered, then grouped by local day and time.
 * Days without a match are left out. Unscheduled matches come apart, in code order.
 */
export function buildScheduleView(input: {
  matches: readonly ScheduleMatchInput[];
  filters: MatchFilters;
  settings: Pick<SeasonSettings, 'set_target' | 'sets_per_match' | 'relay_milestones' | 'timezone'>;
}): { days: ScheduleDay<MatchCard>[]; unscheduled: MatchCard[]; count: number } {
  const { matches, filters, settings } = input;
  const cards = matches
    .filter(
      (m) =>
        (!filters.team || m.home_team_id === filters.team || m.away_team_id === filters.team) &&
        (!filters.court || m.court_id === filters.court) &&
        (!filters.stage || (filters.stage === 'group') === (m.stage === 'group')),
    )
    .sort((a, b) => a.code.localeCompare(b.code))
    .map((m): MatchCard => ({ ...m, score: matchScore(m, settings) }));

  const grid = scheduleGrid(cards, [], settings.timezone);
  const days = grid.days.filter((d) => !filters.day || d.date === filters.day);
  const unscheduled = filters.day ? [] : grid.unscheduled;
  const count = days.reduce((n, d) => n + d.times.reduce((k, t) => k + t.matches.length, 0), 0) + unscheduled.length;
  return { days, unscheduled, count };
}
