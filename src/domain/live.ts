// Live scoring (spec-phase-2 §4–§6): the live state of one set or relay leg is a pure function of
// the slot setup and its append-only event log. The server replays the log with every new event to
// validate it; the scorer screen replays it for the instant optimistic view.
import type { Side } from './lineup';
import type { Score } from './score';
import type { SeasonSettings } from './settings';

/** Service court, as seen by the players of one side. */
export type Court = 'right' | 'left';

/** The two players of one side in this set or leg (player ids). */
export type Pair = readonly [string, string];

/** Which side stands on the left of the scorer's screen. */
export interface Ends {
  left: Side;
}

/** The fixed data of a slot: who plays, and from which score. */
export interface SlotSetup {
  kind: 'group' | 'relay';
  /** The set (group) or leg (relay) number, from 1. */
  slot_no: number;
  /** Group: the start points (handicap). Relay: the cumulative score at the start of the leg. */
  start: Score;
  pairs: Record<Side, Pair>;
  /** Relay leg 2 and later: the side that won the last rally of the previous leg serves first (L4). */
  carried_serving_side?: Side;
}

/** The scorer's choices at the start of a set or leg (L1); a later `setup` event corrects them. */
export interface SetupPayload {
  /** Only taken at a 0–0 start (the toss). Fixed by the handicap or the previous leg otherwise. */
  serving_side?: Side;
  server: string;
  receiver: string;
  /** The ends at the start of the set or leg. The halfway change of ends mirrors them. */
  ends: Ends;
}

export type LiveEvent =
  | { seq: number; kind: 'setup'; payload: SetupPayload }
  | { seq: number; kind: 'point'; payload: { side: Side } }
  /** Cancels the point with this `seq`, which must be the last uncancelled one. */
  | { seq: number; kind: 'undo'; payload: { seq: number } }
  | { seq: number; kind: 'ends_changed' }
  | { seq: number; kind: 'timeout_start'; payload: { player: string } }
  | { seq: number; kind: 'timeout_end' }
  | { seq: number; kind: 'retire'; payload: { player: string } }
  | { seq: number; kind: 'end_confirmed' }
  | { seq: number; kind: 'reopened'; payload: { reason: string } };

export type LiveEventKind = LiveEvent['kind'];

export type LiveRuleCode =
  | 'SEQ_OUT_OF_ORDER'
  | 'NOT_SET_UP'
  | 'SERVING_SIDE_FIXED'
  | 'SERVING_SIDE_REQUIRED'
  | 'INVALID_SERVER'
  | 'INVALID_RECEIVER'
  | 'CHANGE_ENDS_PENDING'
  | 'CHANGE_ENDS_NOT_DUE'
  | 'IN_TIMEOUT'
  | 'NO_TIMEOUT'
  | 'NOT_ON_COURT'
  | 'NOT_INJURED_PLAYER'
  | 'ENDED'
  | 'NOT_ENDED'
  | 'CONFIRMED'
  | 'NOT_CONFIRMED'
  | 'NOTHING_TO_UNDO'
  | 'UNDO_NOT_LAST'
  | 'REASON_REQUIRED';

/** One counted rally, for the timeline (score worm). */
export interface Rally {
  seq: number;
  side: Side;
  /** The score after this rally. */
  score: Score;
}

export interface LiveState {
  /** The scoreboard, start points included. Relay: cumulative. */
  score: Score;
  /** `set_target` (group) or this leg's milestone (relay). */
  target: number;
  /** A `setup` event has been recorded. Until then the positions below are `null`. */
  setUp: boolean;
  servingSide: Side | null;
  server: string | null;
  receiver: string | null;
  /** The court the server serves from (even score: right, odd: left). The receiver stands in the same court. */
  serverCourt: Court | null;
  /** Who stands in each service court, per side. */
  positions: Record<Side, Record<Court, string>> | null;
  /** The current ends, the halfway change applied. */
  ends: Ends | null;
  /** Group: the change-of-ends point was reached and the scorer has not tapped Tiếp tục yet. */
  changeEndsDue: boolean;
  /** Group: the halfway change of ends happened in this set. */
  endsChanged: boolean;
  /** A side reached the target, or a side retired. */
  ended: boolean;
  /** The end is confirmed (`end_confirmed` or `retire`); only a `reopened` event is accepted. */
  confirmed: boolean;
  winnerSide: Side | null;
  timeout: { player: string; side: Side; seq: number } | null;
  retired: { side: Side; player: string } | null;
  rallies: Rally[];
  /** The `seq` of the last event, 0 for an empty log. The next event must be `lastSeq + 1`. */
  lastSeq: number;
}

export type LiveSettings = Pick<SeasonSettings, 'set_target' | 'relay_milestones'>;

export type LiveResult =
  | { ok: true; state: LiveState }
  | {
      ok: false;
      /** The rejected event. */
      seq: number;
      code: LiveRuleCode;
      /** The state before the rejected event. */
      state: LiveState;
    };

export class LiveEventError extends Error {
  constructor(
    readonly code: LiveRuleCode,
    readonly seq: number,
  ) {
    super(`live event ${seq} rejected: ${code}`);
    this.name = 'LiveEventError';
  }
}

const SIDES: readonly Side[] = ['home', 'away'];
const other = (side: Side): Side => (side === 'home' ? 'away' : 'home');
const courtFor = (score: number): Court => (score % 2 === 0 ? 'right' : 'left');
const otherCourt = (court: Court): Court => (court === 'right' ? 'left' : 'right');
const partnerOf = (pair: Pair, player: string) => (pair[0] === player ? pair[1] : pair[0]);

/** The score at which the ends change in a group set (L2): 16 for a set to 31. */
export function changeOfEndsPoint(setTarget: number): number {
  return Math.floor((setTarget + 1) / 2);
}

/** The target of the slot: `set_target`, or the leg's milestone. */
export function slotTarget(setup: SlotSetup, settings: LiveSettings): number {
  return setup.kind === 'group' ? settings.set_target : settings.relay_milestones[setup.slot_no - 1];
}

/**
 * The serving side when it is not the scorer's choice (L1, L4): the side that starts at 0 when
 * there is a handicap, the carried side at a relay leg change; `null` at a 0–0 start (the toss).
 */
export function fixedServingSide(setup: SlotSetup): Side | null {
  if (setup.carried_serving_side) return setup.carried_serving_side;
  if (setup.start.home === setup.start.away) return null;
  return setup.start.home < setup.start.away ? 'home' : 'away';
}

/** Sides whose score triggers the halfway change of ends: the side that started at 0 (L2). */
function changeOfEndsSides(setup: SlotSetup): Side[] {
  const low = Math.min(setup.start.home, setup.start.away);
  return SIDES.filter((side) => setup.start[side] === low);
}

/** The log reduced to what counts: the latest setup, the uncancelled points and the flags. */
interface Log {
  setup: SetupPayload | null;
  points: { seq: number; side: Side }[];
  endsChanged: boolean;
  timeout: LiveState['timeout'];
  retired: LiveState['retired'];
  confirmed: boolean;
  lastSeq: number;
}

/** Recomputes positions and servers from the latest setup over every uncancelled point (§4.2, §4.5). */
function derive(slot: SlotSetup, log: Log, settings: LiveSettings): LiveState {
  const target = slotTarget(slot, settings);
  const score: Score = { ...slot.start };
  const rallies: Rally[] = [];
  let servingSide: Side | null = null;
  let positions: Record<Side, Record<Court, string>> | null = null;
  let changeOfEndsReached = false;
  const half = changeOfEndsPoint(target);
  const triggerSides = changeOfEndsSides(slot);

  if (log.setup) {
    const { server, receiver } = log.setup;
    servingSide = fixedServingSide(slot) ?? log.setup.serving_side!;
    const receivingSide = other(servingSide);
    const court = courtFor(score[servingSide]);
    positions = {
      [servingSide]: { [court]: server, [otherCourt(court)]: partnerOf(slot.pairs[servingSide], server) },
      [receivingSide]: { [court]: receiver, [otherCourt(court)]: partnerOf(slot.pairs[receivingSide], receiver) },
    } as Record<Side, Record<Court, string>>;

    for (const point of log.points) {
      // The serving side wins: its players swap courts. The receiving side wins: nobody moves, and it serves.
      if (point.side === servingSide) {
        const own = positions[servingSide];
        positions[servingSide] = { right: own.left, left: own.right };
      } else {
        servingSide = point.side;
      }
      score[point.side] += 1;
      rallies.push({ seq: point.seq, side: point.side, score: { ...score } });
      if (slot.kind === 'group' && triggerSides.includes(point.side) && score[point.side] === half) {
        changeOfEndsReached = true;
      }
    }
  }

  const atTarget = SIDES.find((side) => score[side] >= target) ?? null;
  const winnerSide = log.retired ? other(log.retired.side) : atTarget;
  const ended = winnerSide !== null;
  const serverCourt = servingSide ? courtFor(score[servingSide]) : null;
  const startEnds = log.setup?.ends ?? null;

  return {
    score,
    target,
    setUp: log.setup !== null,
    servingSide,
    server: positions && servingSide && serverCourt ? positions[servingSide][serverCourt] : null,
    receiver: positions && servingSide && serverCourt ? positions[other(servingSide)][serverCourt] : null,
    serverCourt,
    positions,
    ends: startEnds && (log.endsChanged ? { left: other(startEnds.left) } : startEnds),
    changeEndsDue: changeOfEndsReached && !log.endsChanged && !ended,
    endsChanged: log.endsChanged,
    ended,
    confirmed: log.confirmed,
    winnerSide,
    timeout: log.timeout,
    retired: log.retired,
    rallies,
    lastSeq: log.lastSeq,
  };
}

const onCourt = (slot: SlotSetup, player: string): Side | null =>
  SIDES.find((side) => slot.pairs[side].includes(player)) ?? null;

/** Applies one event to the log, or returns why it is rejected. */
function step(slot: SlotSetup, log: Log, state: LiveState, event: LiveEvent): Log | LiveRuleCode {
  if (event.seq !== log.lastSeq + 1) return 'SEQ_OUT_OF_ORDER';
  // L10: once the end is confirmed, only the BTC can reopen it.
  if (log.confirmed && event.kind !== 'reopened') return 'CONFIRMED';
  const next: Log = { ...log, lastSeq: event.seq };

  switch (event.kind) {
    case 'setup': {
      const { serving_side, server, receiver } = event.payload;
      const fixed = fixedServingSide(slot);
      if (fixed && serving_side && serving_side !== fixed) return 'SERVING_SIDE_FIXED';
      const side = fixed ?? serving_side;
      if (!side) return 'SERVING_SIDE_REQUIRED';
      if (!slot.pairs[side].includes(server)) return 'INVALID_SERVER';
      if (!slot.pairs[other(side)].includes(receiver)) return 'INVALID_RECEIVER';
      return { ...next, setup: event.payload };
    }
    case 'point':
      if (!state.setUp) return 'NOT_SET_UP';
      if (state.timeout) return 'IN_TIMEOUT';
      if (state.ended) return 'ENDED';
      if (state.changeEndsDue) return 'CHANGE_ENDS_PENDING';
      return { ...next, points: [...log.points, { seq: event.seq, side: event.payload.side }] };
    case 'undo': {
      const last = log.points.at(-1);
      if (!last) return 'NOTHING_TO_UNDO';
      if (event.payload.seq !== last.seq) return 'UNDO_NOT_LAST';
      return { ...next, points: log.points.slice(0, -1) };
    }
    case 'ends_changed':
      if (!state.changeEndsDue) return 'CHANGE_ENDS_NOT_DUE';
      return { ...next, endsChanged: true };
    case 'timeout_start': {
      if (!state.setUp) return 'NOT_SET_UP';
      if (state.timeout) return 'IN_TIMEOUT';
      if (state.ended) return 'ENDED';
      const side = onCourt(slot, event.payload.player);
      if (!side) return 'NOT_ON_COURT';
      return { ...next, timeout: { player: event.payload.player, side, seq: event.seq } };
    }
    case 'timeout_end':
      if (!state.timeout) return 'NO_TIMEOUT';
      return { ...next, timeout: null };
    case 'retire':
      // §6: a retirement follows a medical timeout of the same player.
      if (!state.timeout) return 'NO_TIMEOUT';
      if (event.payload.player !== state.timeout.player) return 'NOT_INJURED_PLAYER';
      return {
        ...next,
        timeout: null,
        retired: { side: state.timeout.side, player: state.timeout.player },
        confirmed: true,
      };
    case 'end_confirmed':
      if (!state.ended) return 'NOT_ENDED';
      return { ...next, confirmed: true };
    case 'reopened':
      if (!log.confirmed) return 'NOT_CONFIRMED';
      if (event.payload.reason.trim() === '') return 'REASON_REQUIRED';
      return { ...next, confirmed: false, retired: null };
  }
}

/**
 * Replays the log of one slot and stops at the first invalid event. The server calls this with the
 * stored log plus the new event and rejects the event if the result is not `ok`.
 */
export function tryReplay(setup: SlotSetup, events: readonly LiveEvent[], settings: LiveSettings): LiveResult {
  let log: Log = {
    setup: null,
    points: [],
    endsChanged: false,
    timeout: null,
    retired: null,
    confirmed: false,
    lastSeq: 0,
  };
  let state = derive(setup, log, settings);
  for (const event of events) {
    const result = step(setup, log, state, event);
    if (typeof result === 'string') return { ok: false, seq: event.seq, code: result, state };
    log = result;
    state = derive(setup, log, settings);
  }
  return { ok: true, state };
}

/** The live state of a slot from its stored (already validated) log. Throws `LiveEventError` on an invalid event. */
export function replay(setup: SlotSetup, events: readonly LiveEvent[], settings: LiveSettings): LiveState {
  const result = tryReplay(setup, events, settings);
  if (!result.ok) throw new LiveEventError(result.code, result.seq);
  return result.state;
}

export interface LegChange {
  /** The cumulative score the next leg starts from. */
  start: Score;
  /** The winner of the last rally serves first (L4). */
  carried_serving_side: Side;
  /** The ends change at every leg change (L3). */
  ends: Ends;
}

/**
 * Relay leg change (§4.4): what the next leg carries over from the ended one. `null` while the leg
 * has not ended with a rally (no rally, no setup, or a retirement, which ends the match).
 */
export function legChange(previous: LiveState): LegChange | null {
  const last = previous.rallies.at(-1);
  if (!previous.ended || previous.retired || !last || !previous.ends) return null;
  return {
    start: { ...previous.score },
    carried_serving_side: last.side,
    ends: { left: other(previous.ends.left) },
  };
}
