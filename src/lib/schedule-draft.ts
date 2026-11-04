// Schedule drafts (spec §6 A4): date, time, court and referee changes stay on the page until the BTC
// saves them all at once with save_match_slots.

import { isUuid } from './auth/users';
import { parseMatchSlot, type MatchSlotError, type SlotFields } from './schedule';

export type DraftMatch = {
  id: string;
  /** Started or ended, or a group match of a season past the group stage: save_match_slots refuses it. */
  locked: boolean;
  /** As saved. */
  slot: SlotFields;
};

/** Unsaved slots by match id. Kept apart from the saved schedule, so a refresh rebases them. */
export type SlotDraft = Record<string, SlotFields>;

export const EMPTY_SLOT_DRAFT: SlotDraft = {};

/** Most slots one save may send: more than any season has matches. */
export const MAX_SLOT_CHANGES = 500;

/** What `saveMatchSlots` takes: the full slot of each changed match. */
export type SlotChange = SlotFields & { matchId: string };

const FIELDS = ['date', 'time', 'courtId', 'refereeId'] as const;

function sameSlot(a: SlotFields, b: SlotFields): boolean {
  return FIELDS.every((field) => a[field] === b[field]);
}

/** Sets some fields of a match's slot in the draft, on top of what is saved or already drafted. */
export function editSlot(draft: SlotDraft, match: DraftMatch, patch: Partial<SlotFields>): SlotDraft {
  return { ...draft, [match.id]: { ...(draft[match.id] ?? match.slot), ...patch } };
}

/** Drops what would not change the saved schedule: unknown or locked matches and slots as saved. */
export function normalizeSlotDraft(matches: readonly DraftMatch[], draft: SlotDraft): SlotDraft {
  const normalized: SlotDraft = {};
  for (const match of matches) {
    const slot = draft[match.id];
    if (slot && !match.locked && !sameSlot(slot, match.slot)) normalized[match.id] = slot;
  }
  return normalized;
}

/** The slot of a match as it will be once the draft is saved. */
export function draftSlot(match: DraftMatch, draft: SlotDraft): SlotFields {
  return draft[match.id] ?? match.slot;
}

/**
 * Start of a slot as an ISO timestamp, as `findScheduleConflicts` compares them. Null while the date
 * or the time is missing or invalid.
 */
export function slotStart(slot: SlotFields, timeZone: string): string | null {
  const parsed = parseMatchSlot({ date: slot.date, time: slot.time }, timeZone);
  return parsed.ok ? (parsed.value.scheduledAt?.toISOString() ?? null) : null;
}

/** Errors of each drafted slot that can be told on the page, by match id. */
export function draftErrors(draft: SlotDraft, timeZone: string): Record<string, MatchSlotError[]> {
  const errors: Record<string, MatchSlotError[]> = {};
  for (const [matchId, slot] of Object.entries(draft)) {
    const parsed = parseMatchSlot(slot, timeZone);
    if (!parsed.ok) errors[matchId] = parsed.errors;
  }
  return errors;
}

export function draftChanges(draft: SlotDraft): SlotChange[] {
  return Object.entries(draft).map(([matchId, slot]) => ({ matchId, ...slot }));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/**
 * Checks the shape of what a client sent to `saveMatchSlots`: match ids are UUIDs listed once, the
 * fields are strings, and the size is bounded. Field values are checked by `parseMatchSlot`, and
 * whether they belong to the season by save_match_slots. Null when invalid.
 */
export function parseSlotChanges(input: unknown): SlotChange[] | null {
  if (!Array.isArray(input) || input.length > MAX_SLOT_CHANGES) return null;
  const changes: SlotChange[] = [];
  for (const change of input as unknown[]) {
    if (!isRecord(change)) return null;
    const { matchId, date, time, courtId, refereeId } = change;
    if (typeof matchId !== 'string' || !isUuid(matchId)) return null;
    if (![date, time, courtId, refereeId].every((value) => typeof value === 'string')) return null;
    changes.push({
      matchId,
      date: date as string,
      time: time as string,
      courtId: courtId as string,
      refereeId: refereeId as string,
    });
  }
  if (new Set(changes.map((c) => c.matchId)).size !== changes.length) return null;
  return changes;
}
