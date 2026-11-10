import type { LiveEvent } from '../domain/live';
import type { Score } from '../domain/score';
import type { SeasonSettings } from '../domain/settings';
import { countedPoints } from './live-scoring';
import type { ScoreRules } from './match-scores';
import { substitutionsOpen } from './match-substitution';

// Entry into live scoring on A5 (spec-phase-2 §8.0, §8.1 L-A): which state the Live scoring card is
// in, where the match stands, and the L6 rule on substitutions.

export type SlotLiveStatus = 'pending' | 'live' | 'finished';

/** A slot as the A5 screens read it for live scoring. */
export interface LiveEntrySlot {
  slot_no: number;
  live_status: SlotLiveStatus;
  score_home: number | null;
  score_away: number | null;
  handicap_home: number;
  handicap_away: number;
}

/**
 * The match is scored live: the season has `live_scoring` on and the BTC has not switched the match
 * to Phase 1 final-score entry (L6). Mirrors `private.match_is_live_scored`.
 */
export function isLiveScored(settings: Pick<SeasonSettings, 'live_scoring'>, match: { final_entry: boolean }): boolean {
  return settings.live_scoring && !match.final_entry;
}

/**
 * The Substitute action (L6): open from the lock until the match is completed, except in a live-scored
 * match, where a player who cannot continue goes through the injury flow instead.
 */
export function substitutionsOffered(status: string, liveScored: boolean): boolean {
  return substitutionsOpen(status) && !liveScored;
}

/** A Phase 1 row is read-only once its slot has a live event, so the two ways never overwrite each other. */
export function scoredLive(slot: Pick<LiveEntrySlot, 'live_status'>): boolean {
  return slot.live_status !== 'pending';
}

/** A slot live scoring can still take: live already, or neither live nor entered as a final score. */
function openForLive(slot: LiveEntrySlot): boolean {
  return slot.live_status === 'live' || (slot.live_status === 'pending' && slot.score_home === null);
}

/**
 * The card states of §8.0, plus `final` when the BTC switched the match to final-score entry.
 *
 * - `unlocked`: the lineups are not locked yet.
 * - `ready`: locked, nobody holds the scorer lock.
 * - `mine` / `other`: the viewer, or another user, holds the lock.
 * - `done`: the match is completed.
 */
export type LiveCardState = 'unlocked' | 'ready' | 'mine' | 'other' | 'done' | 'final';

/**
 * The state of the Live scoring card, or `null` when there is no card: the season has live scoring
 * off, the match was forfeit or annulled, or every slot was entered as a final score.
 */
export function liveCardState(input: {
  status: string;
  settings: Pick<SeasonSettings, 'live_scoring'>;
  finalEntry: boolean;
  scorerId: string | null;
  viewerId: string;
  slots: readonly LiveEntrySlot[];
}): LiveCardState | null {
  const { status, settings, finalEntry, scorerId, viewerId, slots } = input;
  if (!settings.live_scoring) return null;
  if (status === 'scheduled') return 'unlocked';
  if (status === 'completed') return slots.some(scoredLive) ? 'done' : null;
  if (status !== 'lineup_locked' && status !== 'in_progress') return null;
  if (finalEntry) return 'final';
  if (scorerId === viewerId) return 'mine';
  if (scorerId) return 'other';
  return slots.some(openForLive) ? 'ready' : null;
}

/** The BTC can switch to final-score entry only before any rally: no slot has a live event. */
export function canSwitchToFinalEntry(slots: readonly Pick<LiveEntrySlot, 'live_status'>[]): boolean {
  return !slots.some(scoredLive);
}

/** Where live scoring stands: the set or leg being played, and its score (start points included). */
export interface LiveProgress {
  slotNo: number;
  score: Score;
}

/**
 * The set or leg being scored and its score, as `Set 3 · 9–16` shows it: the first slot that is
 * `live`, or, between two sets, the next slot still open, at its start. `null` before the first live
 * event. Relay scores are cumulative: a leg starts from the previous leg's score.
 */
export function liveProgress(
  rules: ScoreRules,
  slots: readonly LiveEntrySlot[],
  eventsOf: (slotNo: number) => readonly LiveEvent[],
): LiveProgress | null {
  const sorted = [...slots].sort((a, b) => a.slot_no - b.slot_no);
  if (!sorted.some(scoredLive)) return null;
  const current = sorted.find((s) => s.live_status === 'live') ?? sorted.find(openForLive);
  if (!current) return null;

  let start: Score;
  if (!rules.relay) start = { home: current.handicap_home, away: current.handicap_away };
  else if (current.slot_no === 1) start = rules.start;
  else {
    const before = sorted.find((s) => s.slot_no === current.slot_no - 1);
    if (before?.score_home == null || before.score_away == null) return null;
    start = { home: before.score_home, away: before.score_away };
  }

  const score = { ...start };
  for (const point of countedPoints(eventsOf(current.slot_no))) score[point.side] += 1;
  return { slotNo: current.slot_no, score };
}
