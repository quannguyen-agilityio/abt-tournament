import type { MatchStatus, Placing, SeasonSettings } from '../domain';
import type { BracketSlotView } from './public-bracket';
import { matchScore, type MatchCard, type ScheduleMatchInput } from './public-matches';

/** One court in the "Now / Next" panel: what is being played there and the match after it. */
export interface CourtNowNext {
  courtId: string;
  court: string;
  now: MatchCard[];
  next: MatchCard | null;
}

export interface HomeView {
  /** False until the first match is created: the page shows the "no schedule" state. */
  hasSchedule: boolean;
  /** Courts with a match in progress or still to play, in court order. */
  courts: CourtNowNext[];
  /** The latest results, newest first. */
  latest: MatchCard[];
}

export interface PodiumPlace {
  placing: Placing;
  teamId: string;
  /** VND; null when the season has no prize for this place. */
  prize: number | null;
}

const LATEST_COUNT = 5;
const UPCOMING: readonly MatchStatus[] = ['scheduled', 'lineup_locked'];
const DECIDED: readonly MatchStatus[] = ['completed', 'forfeit'];

/** Earliest first; unscheduled matches go last, in code order. */
function byTime(a: ScheduleMatchInput, b: ScheduleMatchInput): number {
  if (a.scheduled_at !== b.scheduled_at) {
    if (a.scheduled_at === null) return 1;
    if (b.scheduled_at === null) return -1;
    return Date.parse(a.scheduled_at) - Date.parse(b.scheduled_at);
  }
  return a.code.localeCompare(b.code);
}

/**
 * The season home (spec §5 P1): per court, the match in progress and the next one to play, and
 * the latest results. Matches without a court are left out of "Now / Next".
 */
export function buildHomeView(input: {
  matches: readonly ScheduleMatchInput[];
  courts: readonly { id: string; name: string }[];
  settings: Pick<SeasonSettings, 'set_target' | 'sets_per_match' | 'relay_milestones'>;
}): HomeView {
  const { matches, courts, settings } = input;
  const card = (m: ScheduleMatchInput): MatchCard => ({ ...m, score: matchScore(m, settings) });
  const sorted = [...matches].sort(byTime);

  const perCourt = courts
    .map((court): CourtNowNext => {
      const here = sorted.filter((m) => m.court_id === court.id);
      const next = here.find((m) => UPCOMING.includes(m.status));
      return {
        courtId: court.id,
        court: court.name,
        now: here.filter((m) => m.status === 'in_progress').map(card),
        next: next ? card(next) : null,
      };
    })
    .filter((c) => c.now.length > 0 || c.next !== null);

  const latest = sorted
    .filter((m) => DECIDED.includes(m.status))
    .reverse()
    .slice(0, LATEST_COUNT)
    .map(card);

  return { hasSchedule: matches.length > 0, courts: perCourt, latest };
}

/**
 * Champion, runner-up and third place from the final and the third-place match, each with its
 * prize. A place whose match is not decided yet is left out.
 */
export function buildPodium(bracket: readonly BracketSlotView[], prizes: SeasonSettings['prizes']): PodiumPlace[] {
  const decided = (code: 'F' | '3RD') => {
    const slot = bracket.find((s) => s.code === code);
    if (!slot || slot.home.teamId === null || slot.away.teamId === null) return null;
    if (slot.home.won) return { winner: slot.home.teamId, loser: slot.away.teamId };
    if (slot.away.won) return { winner: slot.away.teamId, loser: slot.home.teamId };
    return null;
  };
  const final = decided('F');
  const third = decided('3RD');
  const places: [Placing, string | undefined][] = [
    ['champion', final?.winner],
    ['runner_up', final?.loser],
    ['third', third?.winner],
  ];
  return places
    .filter((p): p is [Placing, string] => p[1] !== undefined)
    .map(([placing, teamId]) => ({ placing, teamId, prize: prizes[placing] > 0 ? prizes[placing] : null }));
}
