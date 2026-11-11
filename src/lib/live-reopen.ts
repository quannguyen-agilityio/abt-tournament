import type { Side } from '../domain/lineup';
import type { LiveEvent } from '../domain/live';
import type { SlotLiveStatus } from './live-entry';
import { countedPoints } from './live-scoring';

// BTC reopen of a confirmed set or leg (spec-phase-2 §4.5, L10): which confirmed slots the A5 card
// offers to reopen, and what a reopen clears. Mirrors the checks of `live_apply` and of the trigger
// `private.live_reopen_clear_retirement`, so the card never offers a reopen the server refuses.

/** A slot as the reopen rules read it. */
export interface ReopenSlot {
  slot_no: number;
  live_status: SlotLiveStatus;
  score_home: number | null;
  score_away: number | null;
  home_p1: string | null;
  home_p2: string | null;
  away_p1: string | null;
  away_p2: string | null;
  retired_side: Side | null;
  retired_player_id: string | null;
  forfeit_side: Side | null;
}

/**
 * Why a confirmed relay leg cannot be reopened now:
 * - `notLast`: a later leg is confirmed. Legs are reopened from the last one backwards.
 * - `nextStarted`: the next leg has a point. The scorer undoes its points first.
 */
export type ReopenBlock = 'notLast' | 'nextStarted';

export interface ReopenOption {
  slotNo: number;
  /** The `seq` of the `reopened` event: the slot's last `seq` + 1. */
  expectedSeq: number;
  /** `null` when the BTC can reopen it now. */
  blocked: ReopenBlock | null;
  /** The slot ended by retirement: the reopen clears it (§6). */
  retirement: { side: Side; player: string } | null;
  /** Later sets forfeited because of that retirement, which the reopen clears too (group, L8). */
  clearsForfeits: number[];
}

const lineup = (slot: ReopenSlot) => [slot.home_p1, slot.home_p2, slot.away_p1, slot.away_p2];

/**
 * The confirmed slots of a live-scored match, in order, with whether each can be reopened now.
 *
 * - Group: any confirmed set, even while another set is live (sets are independent).
 * - Relay: only the last confirmed leg, and only while the next leg has no point (scores are
 *   cumulative).
 */
export function reopenOptions(
  relay: boolean,
  slots: readonly ReopenSlot[],
  eventsOf: (slotNo: number) => readonly LiveEvent[],
): ReopenOption[] {
  const sorted = [...slots].sort((a, b) => a.slot_no - b.slot_no);
  return sorted
    .filter((slot) => slot.live_status === 'finished')
    .map((slot) => {
      let blocked: ReopenBlock | null = null;
      if (relay) {
        const later = sorted.filter((s) => s.slot_no > slot.slot_no);
        const next = later.find((s) => s.slot_no === slot.slot_no + 1);
        if (later.some((s) => s.score_home !== null)) blocked = 'notLast';
        else if (next && countedPoints(eventsOf(next.slot_no)).length > 0) blocked = 'nextStarted';
      }

      const retirement =
        slot.retired_side && slot.retired_player_id
          ? { side: slot.retired_side, player: slot.retired_player_id }
          : null;
      const clearsForfeits = retirement
        ? sorted
            .filter(
              (s) =>
                s.slot_no > slot.slot_no &&
                s.forfeit_side !== null &&
                lineup(s).includes(retirement.player) &&
                eventsOf(s.slot_no).length === 0,
            )
            .map((s) => s.slot_no)
        : [];

      return {
        slotNo: slot.slot_no,
        expectedSeq: (eventsOf(slot.slot_no).at(-1)?.seq ?? 0) + 1,
        blocked,
        retirement,
        clearsForfeits,
      };
    });
}
