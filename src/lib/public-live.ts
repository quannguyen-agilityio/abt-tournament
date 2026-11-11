import type { Side } from '../domain/lineup';
import type { LiveEvent } from '../domain/live';
import type { Score } from '../domain/score';
import { liveProgress, type LiveEntrySlot } from './live-entry';
import { countedPoints, lastRallySide } from './live-scoring';
import { scoreRules } from './match-scores';

// Live scoring on the public pages (spec-phase-2 §8.2). P1 and P3 show a summary of each live match,
// computed on the server so the match list carries a few numbers per match rather than the logs.

/** A live match as the P1 and P3 cards show it: `Set 3 · 14–11`, with the shuttle on the serving side. */
export interface LiveSummary {
  /** The set (group) or leg (relay) being played. */
  slotNo: number;
  relay: boolean;
  /** Start points included. Relay: cumulative. */
  score: Score;
  /** `null` while it cannot be told without the scorer's choice (the toss before the first rally). */
  servingSide: Side | null;
}

/** The match columns the summary needs. */
export interface LiveSummaryMatch {
  stage: string;
  relay_handicap_home: number | null;
  relay_handicap_away: number | null;
}

/**
 * Who serves, without a full replay: the side that won the last rally (rally-point scoring). Before
 * the first rally, the side the scorer picked at the toss, else the side that serves by rule (L1, L4):
 * the side that starts at 0 when the start points differ, or the side that won the last rally of the
 * previous relay leg.
 */
export function servingSideOf(events: readonly LiveEvent[], start: Score, carried: Side | null): Side | null {
  const last = lastRallySide(events);
  if (last) return last;
  if (carried) return carried;
  for (let i = events.length - 1; i >= 0; i -= 1) {
    const event = events[i];
    if (event.kind === 'setup' && event.payload.serving_side) return event.payload.serving_side;
  }
  if (start.home === start.away) return null;
  return start.home < start.away ? 'home' : 'away';
}

/**
 * The summary of a match scored live, or `null` before its first live event. `eventsOf` gives the log
 * of the current slot and, for a relay leg after the first, of the previous leg.
 */
export function liveSummary(
  match: LiveSummaryMatch,
  slots: readonly LiveEntrySlot[],
  eventsOf: (slotNo: number) => readonly LiveEvent[],
): LiveSummary | null {
  const rules = scoreRules(match);
  const progress = liveProgress(rules, slots, eventsOf);
  if (!progress) return null;
  const events = eventsOf(progress.slotNo);
  const points = countedPoints(events);
  const start: Score = { ...progress.score };
  for (const point of points) start[point.side] -= 1;
  const carried = rules.relay && progress.slotNo > 1 ? lastRallySide(eventsOf(progress.slotNo - 1)) : null;
  return {
    slotNo: progress.slotNo,
    relay: rules.relay,
    score: progress.score,
    servingSide: servingSideOf(events, start, carried),
  };
}
