import type { Side } from '../domain/lineup';
import type { LiveEvent } from '../domain/live';
import type { Score } from '../domain/score';
import { liveProgress, type LiveEntrySlot } from './live-entry';
import { countedPoints, lastRallySide, liveSlotSetup, type LiveSlotContext, type LiveSlotRow } from './live-scoring';
import { scoreRules } from './match-scores';
import type { LivePanelData, LivePanelSlot, TimedLiveEvent } from './public-live-panel';

// Live scoring on the public pages (spec-phase-2 §8.2). P1 and P3 show a summary of each live match,
// computed on the server so the match list carries a few numbers per match rather than the logs. P4
// gets the log of the set being played; `public-live-panel.ts` replays it in the browser.

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

// P4 ------------------------------------------------------------------------------------------------

/** A slot row as the match page reads it, with its live columns. */
export interface LivePanelSlotRow extends LiveSlotRow {
  id: string;
  live_status: string;
  score_home: number | null;
  score_away: number | null;
}

/**
 * The live panel of a match in progress that is scored live, or `null` (no panel and no realtime
 * subscription). `logs` holds the stored logs of the slots that have events, by slot id.
 */
export function buildLivePanel(input: {
  match: LiveSlotContext['match'] & { status: string };
  slots: readonly LivePanelSlotRow[];
  logs: ReadonlyMap<string, readonly TimedLiveEvent[]>;
  settings: LivePanelData['settings'];
}): LivePanelData | null {
  const { match, logs, settings } = input;
  if (match.status !== 'in_progress') return null;
  const rows = [...input.slots].sort((a, b) => a.slot_no - b.slot_no);
  if (!rows.some((s) => s.live_status !== 'pending')) return null;

  const relay = match.stage !== 'group';
  const slots = rows.map((slot): LivePanelSlot => {
    const before = rows.find((s) => s.slot_no === slot.slot_no - 1);
    const previous =
      relay && before
        ? { score: { home: before.score_home, away: before.score_away }, events: logs.get(before.id) ?? [] }
        : undefined;
    return { id: slot.id, slotNo: slot.slot_no, setup: liveSlotSetup({ slot, match, previous }) };
  });

  const setsWon: Score = { home: 0, away: 0 };
  for (const s of rows) {
    if (relay || s.score_home === null || s.score_away === null || s.score_home === s.score_away) continue;
    setsWon[s.score_home > s.score_away ? 'home' : 'away'] += 1;
  }

  const live: Record<string, TimedLiveEvent[]> = {};
  for (const s of rows) if (s.live_status === 'live') live[s.id] = [...(logs.get(s.id) ?? [])];
  return {
    relay,
    settings: {
      set_target: settings.set_target,
      relay_milestones: settings.relay_milestones,
      medical_timeout_minutes: settings.medical_timeout_minutes,
    },
    slots,
    logs: live,
    setsWon,
  };
}
