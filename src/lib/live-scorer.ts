import type { Side } from '../domain/lineup';
import {
  fixedServingSide,
  legChange,
  tryReplay,
  type Court,
  type Ends,
  type LiveEvent,
  type LiveSettings,
  type LiveState,
  type SetupPayload,
  type SlotSetup,
} from '../domain/live';
import type { Score } from '../domain/score';
import type { SlotLiveStatus } from './live-entry';
import { liveSlotSetup, type LiveSlotContext, type LiveSlotRow } from './live-scoring';

// The scorer screens (spec-phase-2 §8.1 L-B–L-E): which set or leg is current, the court diagram
// while choosing the setup, and the checks the screen does on the logs it holds locally. Pure, so
// the screen only renders what these return.

/** A slot of the match as the scorer screen holds it. */
export interface ScorerSlot extends LiveSlotRow {
  id: string;
  slot_type: string;
  live_status: SlotLiveStatus;
  score_home: number | null;
  score_away: number | null;
}

export type ScorerMatch = LiveSlotContext['match'];

/** The log of each slot, by `slot_no`. A missing slot has no event yet. */
export type ScorerLogs = Readonly<Record<number, readonly LiveEvent[]>>;

/**
 * - `final`: entered as a Phase 1 final score, so live scoring skips it.
 * - `finished`: the log ends in a confirmed end.
 * - `live`: the log has events.
 * - `pending`: not started.
 */
export type SlotPhase = 'final' | 'finished' | 'live' | 'pending';

const other = (side: Side): Side => (side === 'home' ? 'away' : 'home');
const logOf = (logs: ScorerLogs, slotNo: number): readonly LiveEvent[] => logs[slotNo] ?? [];

/**
 * The setup `replay()` needs for a slot. Relay leg 2 and later start from the previous leg's
 * cumulative score, taken from its local log once that is confirmed (so the next leg opens as soon as
 * the scorer confirms, without waiting for the server), or from its stored score when it was entered
 * as a final score. `null` when the lineup is incomplete or the previous leg is not confirmed.
 */
export function scorerSlotSetup(
  match: ScorerMatch,
  slots: readonly ScorerSlot[],
  logs: ScorerLogs,
  slotNo: number,
  settings: LiveSettings,
): SlotSetup | null {
  const slot = slots.find((s) => s.slot_no === slotNo);
  if (!slot) return null;
  let previous: LiveSlotContext['previous'];
  if (match.stage !== 'group' && slotNo > 1) {
    const before = slots.find((s) => s.slot_no === slotNo - 1);
    if (!before) return null;
    const events = logOf(logs, before.slot_no);
    if (events.length === 0) {
      previous = { score: { home: before.score_home, away: before.score_away }, events };
    } else {
      const beforeSetup = scorerSlotSetup(match, slots, logs, before.slot_no, settings);
      if (!beforeSetup) return null;
      const result = tryReplay(beforeSetup, events, settings);
      if (!result.ok || !result.state.confirmed) return null;
      previous = { score: result.state.score, events };
    }
  }
  return liveSlotSetup({ slot, match, previous });
}

/** Where a slot stands, from its row, its local log and its setup. */
export function slotPhase(
  slot: Pick<ScorerSlot, 'live_status' | 'score_home' | 'score_away'>,
  log: readonly LiveEvent[],
  setup: SlotSetup | null,
  settings: LiveSettings,
): SlotPhase {
  if (log.length === 0 && slot.live_status === 'pending' && slot.score_home !== null && slot.score_away !== null) {
    return 'final';
  }
  if (log.length === 0) return 'pending';
  if (setup) {
    const result = tryReplay(setup, log, settings);
    if (result.ok && result.state.confirmed) return 'finished';
  }
  return 'live';
}

/** The phase of every slot, by `slot_no`. */
export function slotPhases(
  match: ScorerMatch,
  slots: readonly ScorerSlot[],
  logs: ScorerLogs,
  settings: LiveSettings,
): Record<number, SlotPhase> {
  const phases: Record<number, SlotPhase> = {};
  for (const slot of slots) {
    const setup = scorerSlotSetup(match, slots, logs, slot.slot_no, settings);
    phases[slot.slot_no] = slotPhase(slot, logOf(logs, slot.slot_no), setup, settings);
  }
  return phases;
}

/**
 * The set or leg the scorer works on: the first one being played, else the first not started, else
 * `null` when every slot is finished (the match is done).
 */
export function currentSlotNo(
  match: ScorerMatch,
  slots: readonly ScorerSlot[],
  logs: ScorerLogs,
  settings: LiveSettings,
): number | null {
  const phases = slotPhases(match, slots, logs, settings);
  const sorted = [...slots].sort((a, b) => a.slot_no - b.slot_no);
  return (
    sorted.find((s) => phases[s.slot_no] === 'live')?.slot_no ??
    sorted.find((s) => phases[s.slot_no] === 'pending')?.slot_no ??
    null
  );
}

/** The score of a finished slot (its confirmed replay), or of a slot entered as a final score. */
export function finishedScore(
  match: ScorerMatch,
  slots: readonly ScorerSlot[],
  logs: ScorerLogs,
  slotNo: number,
  settings: LiveSettings,
): Score | null {
  const slot = slots.find((s) => s.slot_no === slotNo);
  if (!slot) return null;
  const log = logOf(logs, slotNo);
  const setup = scorerSlotSetup(match, slots, logs, slotNo, settings);
  const phase = slotPhase(slot, log, setup, settings);
  if (phase === 'final') return { home: slot.score_home!, away: slot.score_away! };
  if (phase !== 'finished' || !setup) return null;
  const result = tryReplay(setup, log, settings);
  return result.ok ? result.state.score : null;
}

/**
 * Group: the sets each side won. Relay: the cumulative score of the last finished leg (zero before
 * the first one).
 */
export function setsWon(
  match: ScorerMatch,
  slots: readonly ScorerSlot[],
  logs: ScorerLogs,
  settings: LiveSettings,
): Score {
  const total: Score = { home: 0, away: 0 };
  const sorted = [...slots].sort((a, b) => a.slot_no - b.slot_no);
  for (const slot of sorted) {
    const score = finishedScore(match, slots, logs, slot.slot_no, settings);
    if (!score) continue;
    if (match.stage === 'group') {
      if (score.home > score.away) total.home += 1;
      else if (score.away > score.home) total.away += 1;
    } else {
      total.home = score.home;
      total.away = score.away;
    }
  }
  return total;
}

/** The slot's log holds a `reopened` event (the BTC reopened it, spec §4.5). */
export function wasReopened(log: readonly LiveEvent[]): boolean {
  return log.some((event) => event.kind === 'reopened');
}

/** Whether the server's logs hold every event the screen holds, so a refresh did not bring an older snapshot. */
export function serverCoversLocal(server: ScorerLogs, local: ScorerLogs): boolean {
  return Object.keys(local).every((key) => {
    const slotNo = Number(key);
    return (logOf(server, slotNo).at(-1)?.seq ?? 0) >= (logOf(local, slotNo).at(-1)?.seq ?? 0);
  });
}

/**
 * Where a player stands on the court diagram, in percent of its width and height. The court is seen
 * from above with the net in the middle. Right and left courts are from each team's own point of
 * view: the team on the left end faces right, so its right court is at the bottom; the team on the
 * right end is the opposite.
 */
export function courtSpot(leftSide: Side, side: Side, court: Court): { x: number; y: number } {
  const onLeft = leftSide === side;
  const bottom = onLeft ? court === 'right' : court === 'left';
  return { x: onLeft ? 25 : 75, y: bottom ? 75 : 25 };
}

/** The scorer's choices while setting up, partial until the last step. */
export interface SetupDraft {
  ends: Ends;
  /** The side that serves first: fixed by the handicap or the previous leg, else the toss. */
  serving: Side | null;
  server: string | null;
  receiver: string | null;
}

/** What the court diagram shows while choosing, and after the first step of a started set. */
export interface SetupPreview {
  left: Side;
  /** Who stands in each court. Before a choice, the pair in its listed order. */
  positions: Record<Side, Record<Court, string>>;
  server: { side: Side; player: string; court: Court } | null;
  /** `player` is `null` until the receiver is chosen. */
  receiver: { side: Side; player: string | null; court: Court } | null;
}

const courtFor = (score: number): Court => (score % 2 === 0 ? 'right' : 'left');
const otherCourt = (court: Court): Court => (court === 'right' ? 'left' : 'right');

/**
 * The court diagram for a partial draft (§4.1): the server stands in the court that matches the
 * serving side's start score (even right, odd left), the receiver in the same-labelled court of the
 * other side, and each partner in the other court.
 */
export function setupPreview(setup: SlotSetup, draft: SetupDraft): SetupPreview {
  const positions: SetupPreview['positions'] = {
    home: { right: setup.pairs.home[0], left: setup.pairs.home[1] },
    away: { right: setup.pairs.away[0], left: setup.pairs.away[1] },
  };
  const preview: SetupPreview = { left: draft.ends.left, positions, server: null, receiver: null };
  const serving = draft.serving;
  if (!serving || draft.server === null || !setup.pairs[serving].includes(draft.server)) return preview;

  const court = courtFor(setup.start[serving]);
  const partner = setup.pairs[serving].find((p) => p !== draft.server)!;
  positions[serving] = { [court]: draft.server, [otherCourt(court)]: partner } as Record<Court, string>;
  preview.server = { side: serving, player: draft.server, court };

  const receiving = other(serving);
  preview.receiver = { side: receiving, player: null, court };
  if (draft.receiver !== null && setup.pairs[receiving].includes(draft.receiver)) {
    const receiverPartner = setup.pairs[receiving].find((p) => p !== draft.receiver)!;
    positions[receiving] = { [court]: draft.receiver, [otherCourt(court)]: receiverPartner } as Record<Court, string>;
    preview.receiver.player = draft.receiver;
  }
  return preview;
}

/**
 * The draft the setup screen opens with. Edit mode starts from the current choices; a relay leg
 * change takes the ends from the ended leg (they change, L3) and the serving side from the previous
 * leg (L4); otherwise the ends default to the home side on the left.
 */
export function initialDraft(setup: SlotSetup, current?: SetupPayload, previousState?: LiveState): SetupDraft {
  const fixed = fixedServingSide(setup);
  if (current) {
    return {
      ends: { left: current.ends.left },
      serving: fixed ?? current.serving_side ?? null,
      server: current.server,
      receiver: current.receiver,
    };
  }
  const change = previousState ? legChange(previousState) : null;
  return {
    ends: change ? change.ends : { left: 'home' },
    serving: fixed ?? change?.carried_serving_side ?? null,
    server: null,
    receiver: null,
  };
}

/** The draft has every choice the `setup` event needs. */
export function draftComplete(setup: SlotSetup, draft: SetupDraft): boolean {
  const { serving, server, receiver } = draft;
  if (!serving || server === null || receiver === null) return false;
  return setup.pairs[serving].includes(server) && setup.pairs[other(serving)].includes(receiver);
}

/** The payload of the `setup` event, or `null` while the draft is incomplete. The serving side is sent only at a 0–0 start. */
export function draftPayload(setup: SlotSetup, draft: SetupDraft): SetupPayload | null {
  if (!draftComplete(setup, draft)) return null;
  const fixed = fixedServingSide(setup);
  return {
    ...(fixed ? {} : { serving_side: draft.serving! }),
    server: draft.server!,
    receiver: draft.receiver!,
    ends: { left: draft.ends.left },
  };
}

/** The latest `setup` payload of a log, to prefill "Sửa thiết lập". */
export function latestSetup(log: readonly LiveEvent[]): SetupPayload | undefined {
  for (let i = log.length - 1; i >= 0; i--) {
    const event = log[i];
    if (event.kind === 'setup') return event.payload;
  }
  return undefined;
}
