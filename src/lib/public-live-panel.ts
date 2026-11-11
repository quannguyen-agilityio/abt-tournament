import type { Side } from '../domain/lineup';
import {
  changeOfEndsPoint,
  tryReplay,
  type LiveEvent,
  type LiveEventKind,
  type LiveSettings,
  type LiveState,
  type Rally,
  type SlotSetup,
} from '../domain/live';
import type { Score } from '../domain/score';
import type { SeasonSettings } from '../domain/settings';

// The P4 live panel in the browser (spec-phase-2 §8.2): it replays the log of the set being played and
// adds every event Supabase Realtime brings. Kept apart from `public-live.ts`, which runs on the server
// and pulls in the scorer's input schemas.

/** A stored event with the time the scorer tapped (`client_at`), for the timeout countdown. */
export type TimedLiveEvent = LiveEvent & { at: string };

/** A slot of the match as the live panel holds it. */
export interface LivePanelSlot {
  id: string;
  slotNo: number;
  /** What `replay()` needs; `null` while a pair is incomplete or the previous relay leg is not confirmed. */
  setup: SlotSetup | null;
}

/** What the P4 live panel starts from. Only plain data, so a server component can pass it to the client. */
export interface LivePanelData {
  relay: boolean;
  settings: LiveSettings & Pick<SeasonSettings, 'medical_timeout_minutes'>;
  /** Every slot of the match: the panel listens to all of them, so the next set shows when it starts. */
  slots: LivePanelSlot[];
  /** The logs of the slots being played, by slot id. */
  logs: Record<string, TimedLiveEvent[]>;
  /** Group: the sets won so far, from the stored scores. */
  setsWon: Score;
}

const NO_PAYLOAD: ReadonlySet<LiveEventKind> = new Set(['ends_changed', 'timeout_end', 'end_confirmed']);

/** A `live_event` row (a query result or a realtime message) as the panel holds it. */
export function toTimedEvent(row: {
  seq: number;
  kind: LiveEventKind;
  payload: unknown;
  client_at: string;
}): TimedLiveEvent {
  const { seq, kind, client_at: at } = row;
  if (NO_PAYLOAD.has(kind)) return { seq, kind, at } as TimedLiveEvent;
  return { seq, kind, payload: row.payload, at } as TimedLiveEvent;
}

const lastSeq = (log: readonly LiveEvent[] | undefined) => log?.at(-1)?.seq ?? 0;

/** Per slot, the longer of two copies of its log: a refresh can bring an older snapshot than realtime did. */
export function mergeLogs(
  a: Readonly<Record<string, readonly TimedLiveEvent[]>>,
  b: Readonly<Record<string, readonly TimedLiveEvent[]>>,
): Record<string, TimedLiveEvent[]> {
  const merged: Record<string, TimedLiveEvent[]> = {};
  for (const id of new Set([...Object.keys(a), ...Object.keys(b)])) {
    merged[id] = [...(lastSeq(b[id]) > lastSeq(a[id]) ? b[id] : (a[id] ?? []))];
  }
  return merged;
}

/**
 * Adds an event that arrived by realtime. `gap` when events are missing in between (a message was
 * lost), so the log has to be read again.
 */
export function appendLiveEvent(
  log: readonly TimedLiveEvent[],
  event: TimedLiveEvent,
): { log: readonly TimedLiveEvent[]; gap: boolean } {
  const last = lastSeq(log);
  if (event.seq <= last) return { log, gap: false };
  if (event.seq > last + 1) return { log, gap: true };
  return { log: [...log, event], gap: false };
}

/** The set or leg the panel shows: the first one with events whose end is not confirmed yet. */
export function currentLiveSlot(
  data: Pick<LivePanelData, 'slots' | 'settings'>,
  logs: Readonly<Record<string, readonly TimedLiveEvent[]>>,
): { slot: LivePanelSlot; state: LiveState; log: readonly TimedLiveEvent[] } | null {
  for (const slot of data.slots) {
    const log = logs[slot.id];
    if (!slot.setup || !log || log.length === 0) continue;
    const state = tryReplay(slot.setup, log, data.settings).state;
    if (!state.confirmed) return { slot, state, log };
  }
  return null;
}

/** The rally timeline (score worm): the lead after each rally, from the start. */
export interface Worm {
  /** Home minus away: at the start, then after each rally. */
  diffs: number[];
  /** Who won each rally; `sides[i]` leads from `diffs[i]` to `diffs[i + 1]`. */
  sides: Side[];
  /** Group: the rally after which the ends changed (index into `diffs`), or `null`. */
  endsAt: number | null;
}

/** The worm of a set or leg, from its setup and its replayed rallies. */
export function wormOf(setup: SlotSetup, rallies: readonly Rally[], setTarget: number): Worm {
  const diffs = [setup.start.home - setup.start.away, ...rallies.map((r) => r.score.home - r.score.away)];
  let endsAt: number | null = null;
  if (setup.kind === 'group') {
    // L2: the change of ends comes when a side that started lowest reaches the halfway point.
    const half = changeOfEndsPoint(setTarget);
    const low = Math.min(setup.start.home, setup.start.away);
    const index = rallies.findIndex((r) => setup.start[r.side] === low && r.score[r.side] === half);
    endsAt = index === -1 ? null : index + 1;
  }
  return { diffs, sides: rallies.map((r) => r.side), endsAt };
}

/** Milliseconds left in a medical timeout that started at `startedAt`, never below 0. */
export function timeoutLeft(startedAt: string, minutes: number, now: number): number {
  return Math.max(0, minutes * 60_000 - (now - Date.parse(startedAt)));
}
