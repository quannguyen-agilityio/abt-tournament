import type { Side } from '../domain/lineup';
import {
  fixedServingSide,
  groupRetirement,
  legChange,
  relayRetirement,
  tryReplay,
  type Court,
  type Ends,
  type LiveEvent,
  type LiveSettings,
  type LiveState,
  type Retirement,
  type RetirementSlot,
  type SetupPayload,
  type SlotSetup,
} from '../domain/live';
import type { Score } from '../domain/score';
import type { SlotLiveStatus } from './live-entry';
import { liveSlotSetup, type LiveSlotContext, type LiveSlotRow } from './live-scoring';

// The scorer screens (spec-phase-2 §8.1 L-B–L-G): which set or leg is current, the court diagram
// while choosing the setup, what a retirement does, and the checks the screen does on the logs it
// holds locally. Pure, so the screen only renders what these return.

/** A slot of the match as the scorer screen holds it. */
export interface ScorerSlot extends LiveSlotRow {
  id: string;
  slot_type: string;
  live_status: SlotLiveStatus;
  score_home: number | null;
  score_away: number | null;
  /** A set forfeited after a retirement (§6, L8), once the server has written it. */
  forfeit_side?: Side | null;
}

export type ScorerMatch = LiveSlotContext['match'];

/** The log of each slot, by `slot_no`. A missing slot has no event yet. */
export type ScorerLogs = Readonly<Record<number, readonly LiveEvent[]>>;

/**
 * - `final`: entered as a Phase 1 final score, or forfeited after a retirement, so live scoring skips it.
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
  // A group retirement forfeits later sets with the injured player (L8). The screen knows it from its
  // own log before the server's rows say so, so it moves on to the next set at once.
  const retirement = match.stage === 'group' ? matchRetirement(match, slots, logs, settings) : null;
  if (retirement) {
    for (const forfeit of groupRetirement(retirement, retirementSlots(slots, phases), settings).forfeits) {
      phases[forfeit.slot_no] = 'final';
    }
  }
  return phases;
}

/**
 * The retirement recorded in the logs (§6): the first slot whose log ends in a `retire` that no
 * reopen cleared, with the injured player's side and the live score when it happened.
 */
export function matchRetirement(
  match: ScorerMatch,
  slots: readonly ScorerSlot[],
  logs: ScorerLogs,
  settings: LiveSettings,
): Retirement | null {
  for (const slot of [...slots].sort((a, b) => a.slot_no - b.slot_no)) {
    const log = logOf(logs, slot.slot_no);
    if (!log.some((event) => event.kind === 'retire')) continue;
    const setup = scorerSlotSetup(match, slots, logs, slot.slot_no, settings);
    if (!setup) continue;
    const result = tryReplay(setup, log, settings);
    if (result.ok && result.state.retired) {
      const { side, player } = result.state.retired;
      return { side, player, slot_no: slot.slot_no, score: result.state.score };
    }
  }
  return null;
}

/**
 * The slots as the retirement rules read them: the stored lineup (a live-scored match has no
 * substitution after the lock, L6), and whether the slot has started. Only a set not started yet is
 * forfeited, as `live_apply` does.
 */
function retirementSlots(slots: readonly ScorerSlot[], phases: Record<number, SlotPhase>): RetirementSlot[] {
  return slots.map((s) => ({
    slot_no: s.slot_no,
    pairs: { home: [s.home_p1 ?? '', s.home_p2 ?? ''], away: [s.away_p1 ?? '', s.away_p2 ?? ''] },
    finished: phases[s.slot_no] !== 'pending',
  }));
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
  // A relay retirement ends the match (L9): the later legs stay empty.
  if (match.stage !== 'group' && matchRetirement(match, slots, logs, settings)) return null;
  const phases = slotPhases(match, slots, logs, settings);
  const sorted = [...slots].sort((a, b) => a.slot_no - b.slot_no);
  return (
    sorted.find((s) => phases[s.slot_no] === 'live')?.slot_no ??
    sorted.find((s) => phases[s.slot_no] === 'pending')?.slot_no ??
    null
  );
}

/**
 * The score of a finished slot (its confirmed replay), or of a slot entered as a final score. A
 * retirement credits the opponent the target in the retired slot and forfeits later sets (§6), as
 * `live_apply` stores them.
 */
export function finishedScore(
  match: ScorerMatch,
  slots: readonly ScorerSlot[],
  logs: ScorerLogs,
  slotNo: number,
  settings: LiveSettings,
): Score | null {
  const slot = slots.find((s) => s.slot_no === slotNo);
  if (!slot) return null;
  const retirement = matchRetirement(match, slots, logs, settings);
  if (retirement?.slot_no === slotNo)
    return storedScore(retirementResult(match, slots, logs, retirement, settings).current);

  const phases = slotPhases(match, slots, logs, settings);
  const phase = phases[slotNo];
  if (phase === 'final') {
    if (slot.score_home !== null && slot.score_away !== null) return { home: slot.score_home, away: slot.score_away };
    const forfeit = retirement
      ? retirementResult(match, slots, logs, retirement, settings).forfeits.find((f) => f.slot_no === slotNo)
      : undefined;
    return forfeit ? storedScore(forfeit) : null;
  }
  if (phase !== 'finished') return null;
  const setup = scorerSlotSetup(match, slots, logs, slotNo, settings);
  if (!setup) return null;
  const result = tryReplay(setup, logOf(logs, slotNo), settings);
  return result.ok ? result.state.score : null;
}

const storedScore = (slot: { score_home: number; score_away: number }): Score => ({
  home: slot.score_home,
  away: slot.score_away,
});

function retirementResult(
  match: ScorerMatch,
  slots: readonly ScorerSlot[],
  logs: ScorerLogs,
  retirement: Retirement,
  settings: LiveSettings,
) {
  if (match.stage !== 'group') return { ...relayRetirement(retirement, settings), forfeits: [] };
  // The phases before the retirement: which later sets had not started when the player retired.
  const phases: Record<number, SlotPhase> = {};
  for (const s of slots) {
    const setup = scorerSlotSetup(match, slots, logs, s.slot_no, settings);
    phases[s.slot_no] = slotPhase(s, logOf(logs, s.slot_no), setup, settings);
  }
  return groupRetirement(retirement, retirementSlots(slots, phases), settings);
}

/** One line of the retirement confirmation (L-G) for a set or leg other than the current one. */
export type RetirementLine =
  /** Group: an earlier set, or a later one already started: its result stays. */
  | { slotNo: number; outcome: 'kept' }
  /** Group: a later set with the injured player in the lineup, forfeited target–0. */
  | { slotNo: number; outcome: 'forfeit'; score: Score }
  /** Group: a later set without the injured player, played as normal. */
  | { slotNo: number; outcome: 'played' }
  /** Relay: a later leg, left empty. */
  | { slotNo: number; outcome: 'empty' };

export interface RetirementPreview {
  relay: boolean;
  /** The injured player's side, which loses. */
  side: Side;
  player: string;
  /** The current set or leg: the live score, and the score stored after the retirement. */
  current: { slotNo: number; live: Score; stored: Score };
  /** The other sets or legs, in order. */
  others: RetirementLine[];
  /** Relay: the final milestone the opponent is credited. */
  milestone: number | null;
}

/**
 * What a retirement of `player` in the current slot would do (L-G, §6), listed before the scorer
 * confirms it. Mirrors `live_apply`, so the list matches what the server writes.
 */
export function retirementPreview(
  match: ScorerMatch,
  slots: readonly ScorerSlot[],
  logs: ScorerLogs,
  settings: LiveSettings,
  retirement: Retirement,
): RetirementPreview {
  const relay = match.stage !== 'group';
  const result = retirementResult(match, slots, logs, retirement, settings);
  const forfeits = new Map(result.forfeits.map((f) => [f.slot_no, f]));
  const phases = slotPhases(match, slots, logs, settings);
  const others: RetirementLine[] = [];
  for (const s of [...slots].sort((a, b) => a.slot_no - b.slot_no)) {
    if (s.slot_no === retirement.slot_no) continue;
    const forfeit = forfeits.get(s.slot_no);
    if (relay) {
      others.push(
        s.slot_no < retirement.slot_no
          ? { slotNo: s.slot_no, outcome: 'kept' }
          : { slotNo: s.slot_no, outcome: 'empty' },
      );
    } else if (forfeit) {
      others.push({ slotNo: s.slot_no, outcome: 'forfeit', score: storedScore(forfeit) });
    } else if (s.slot_no < retirement.slot_no || phases[s.slot_no] !== 'pending') {
      others.push({ slotNo: s.slot_no, outcome: 'kept' });
    } else {
      others.push({ slotNo: s.slot_no, outcome: 'played' });
    }
  }
  return {
    relay,
    side: retirement.side,
    player: retirement.player,
    current: { slotNo: retirement.slot_no, live: retirement.score, stored: storedScore(result.current) },
    others,
    milestone: relay ? (settings.relay_milestones.at(-1) ?? null) : null,
  };
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
