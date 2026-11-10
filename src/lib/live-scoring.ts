import { z } from 'zod';

import { effectivePair, type Side, type SlotSubstitution } from '../domain/lineup';
import {
  tryReplay,
  type LiveEvent,
  type LiveEventKind,
  type LiveRuleCode,
  type LiveSettings,
  type SlotSetup,
} from '../domain/live';
import type { Score } from '../domain/score';
import type { Json } from './database.types';

// Live scoring (spec-phase-2 §7): what the server action checks before it calls `live_apply`. The
// doubles service rules run here, in `replay()`; the RPC then checks the lock and that the log did
// not change in between (`expected_seq`), so the log this validated is the one written.

const side = z.enum(['home', 'away']);
const player = z.string().min(1).max(64);

/** A new event as the scorer screen sends it: its kind and payload, without the `seq` it will get. */
const eventSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('setup'),
    payload: z.object({
      serving_side: side.optional(),
      server: player,
      receiver: player,
      ends: z.object({ left: side }),
    }),
  }),
  z.object({ kind: z.literal('point'), payload: z.object({ side }) }),
  z.object({ kind: z.literal('undo'), payload: z.object({ seq: z.int().min(1) }) }),
  z.object({ kind: z.literal('ends_changed') }),
  z.object({ kind: z.literal('timeout_start'), payload: z.object({ player }) }),
  z.object({ kind: z.literal('timeout_end') }),
  z.object({ kind: z.literal('end_confirmed') }),
  z.object({ kind: z.literal('reopened'), payload: z.object({ reason: z.string().trim().min(1).max(500) }) }),
]);

const inputSchema = z.object({
  slotId: z.uuid(),
  /** The last `seq` of the log the screen replayed, plus one. */
  expectedSeq: z.int().min(1),
  event: eventSchema,
  /** When the scorer tapped, from the device clock. */
  clientAt: z.iso.datetime({ offset: true }).optional(),
});

/** A new event without its `seq`. Retirement (`retire`) comes with the retirement flow (§6). */
export type NewLiveEvent = z.infer<typeof eventSchema>;
export type LiveEventInput = z.infer<typeof inputSchema>;

/** Reads the action's input, or `null` when it is malformed. */
export function parseLiveEventInput(input: unknown): LiveEventInput | null {
  const result = inputSchema.safeParse(input);
  return result.success ? result.data : null;
}

const claimSchema = z.object({
  matchId: z.uuid(),
  /**
   * The scorer the screen showed: `null` to start live scoring when nobody holds the lock, or the
   * current scorer to take over after the confirmation (spec-phase-2 §5). Any GUID: user ids come
   * from auth and the seed accounts are not RFC 4122 UUIDs.
   */
  expectedScorerId: z.guid().nullable().default(null),
});

export type LiveClaimInput = z.infer<typeof claimSchema>;

/** Reads the claim action's input, or `null` when it is malformed. */
export function parseLiveClaimInput(input: unknown): LiveClaimInput | null {
  const result = claimSchema.safeParse(input);
  return result.success ? result.data : null;
}

const finalEntrySchema = z.object({ matchId: z.uuid(), on: z.boolean() });

export type FinalEntryInput = z.infer<typeof finalEntrySchema>;

/** Reads the final-score entry switch's input (§8.1 L-A), or `null` when it is malformed. */
export function parseFinalEntryInput(input: unknown): FinalEntryInput | null {
  const result = finalEntrySchema.safeParse(input);
  return result.success ? result.data : null;
}

/** The new event with the `seq` it is written with. */
export function withSeq(event: NewLiveEvent, seq: number): LiveEvent {
  return { ...event, seq } as LiveEvent;
}

/** The kinds stored without a payload (`{}` in the database). */
const NO_PAYLOAD = new Set<LiveEventKind>(['ends_changed', 'timeout_end', 'end_confirmed']);

/** The payload `live_apply` stores. */
export function eventPayload(event: NewLiveEvent): { [key: string]: Json | undefined } {
  return 'payload' in event ? event.payload : {};
}

/** A stored `live_event` row as `replay()` reads it. */
export function toLiveEvent(row: { seq: number; kind: LiveEventKind; payload: unknown }): LiveEvent {
  const { seq, kind } = row;
  if (NO_PAYLOAD.has(kind)) return { seq, kind } as LiveEvent;
  return { seq, kind, payload: row.payload } as LiveEvent;
}

/** The points no undo cancelled, in order. */
export function countedPoints(events: readonly LiveEvent[]): { seq: number; side: Side }[] {
  const points: { seq: number; side: Side }[] = [];
  for (const event of events) {
    if (event.kind === 'point') points.push({ seq: event.seq, side: event.payload.side });
    else if (event.kind === 'undo' && points.at(-1)?.seq === event.payload.seq) points.pop();
  }
  return points;
}

/** The side that won the last rally no undo cancelled, or `null` when the log has no point left. */
export function lastRallySide(events: readonly LiveEvent[]): Side | null {
  return countedPoints(events).at(-1)?.side ?? null;
}

/** A slot row with its lineup and start points, and the substitutions on it. */
export interface LiveSlotRow {
  slot_no: number;
  home_p1: string | null;
  home_p2: string | null;
  away_p1: string | null;
  away_p2: string | null;
  handicap_home: number;
  handicap_away: number;
  substitutions?: readonly SlotSubstitution[];
}

export interface LiveSlotContext {
  slot: LiveSlotRow;
  match: { stage: string; relay_handicap_home: number | null; relay_handicap_away: number | null };
  /** Relay leg 2 and later: the previous leg's confirmed score and its log. */
  previous?: { score: { home: number | null; away: number | null }; events: readonly LiveEvent[] };
}

/**
 * The fixed data `replay()` needs for a slot (§4.1, §4.4): the pairs on court, the start (start
 * points, the leg-1 start, or the previous leg's cumulative score) and, at a relay leg change, the
 * side that won the last rally of the previous leg. `null` when a pair is incomplete or the previous
 * leg is not confirmed yet.
 */
export function liveSlotSetup({ slot, match, previous }: LiveSlotContext): SlotSetup | null {
  const [h1, h2] = effectivePair(slot, 'home');
  const [a1, a2] = effectivePair(slot, 'away');
  if (!h1 || !h2 || !a1 || !a2) return null;
  const pairs: SlotSetup['pairs'] = { home: [h1, h2], away: [a1, a2] };

  if (match.stage === 'group') {
    return {
      kind: 'group',
      slot_no: slot.slot_no,
      start: { home: slot.handicap_home, away: slot.handicap_away },
      pairs,
    };
  }
  if (slot.slot_no === 1) {
    const start: Score = { home: match.relay_handicap_home ?? 0, away: match.relay_handicap_away ?? 0 };
    return { kind: 'relay', slot_no: 1, start, pairs };
  }
  if (!previous || previous.score.home === null || previous.score.away === null) return null;
  const carried = lastRallySide(previous.events);
  return {
    kind: 'relay',
    slot_no: slot.slot_no,
    start: { home: previous.score.home, away: previous.score.away },
    pairs,
    ...(carried ? { carried_serving_side: carried } : {}),
  };
}

export type LiveCheck = { ok: true } | { ok: false; code: LiveRuleCode };

/**
 * Replays the stored log with the new event (§7). The new event must come right after the log the
 * screen replayed (`expectedSeq`); `live_apply` refuses it as well if the log grew in the meantime.
 */
export function checkLiveEvent(
  setup: SlotSetup,
  events: readonly LiveEvent[],
  input: Pick<LiveEventInput, 'expectedSeq' | 'event'>,
  settings: LiveSettings,
): LiveCheck {
  const last = events.at(-1)?.seq ?? 0;
  if (input.expectedSeq !== last + 1) return { ok: false, code: 'SEQ_OUT_OF_ORDER' };
  const result = tryReplay(setup, [...events, withSeq(input.event, input.expectedSeq)], settings);
  if (result.ok) return { ok: true };
  return { ok: false, code: result.code };
}

/** Events that change what the public pages show outside the live panel: results and match status. */
export function changesPublicResults(kind: LiveEventKind, firstEventOfMatch: boolean): boolean {
  return firstEventOfMatch || kind === 'end_confirmed' || kind === 'reopened';
}
