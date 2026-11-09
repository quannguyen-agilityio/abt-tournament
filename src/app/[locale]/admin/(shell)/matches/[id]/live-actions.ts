'use server';

import type { LiveRuleCode } from '@/domain/live';
import { requireStaff } from '@/lib/auth/session';
import {
  changesPublicResults,
  checkLiveEvent,
  eventPayload,
  liveSlotSetup,
  parseLiveEventInput,
} from '@/lib/live-scoring';
import { loadLiveSlot } from '@/lib/live-scoring-db';
import { invalidatePublicData } from '@/lib/public-cache';
import { createClient } from '@/lib/supabase/server';

export type LiveApplyState =
  | { ok: true; seq: number }
  | {
      error:
        | 'invalid'
        | 'off'
        | 'notScorer'
        | 'changed'
        | 'closed'
        | 'failed'
        // The event breaks a live scoring rule (`replay()`, spec-phase-2 §4–§6).
        | 'rejected';
      code?: LiveRuleCode;
    };

/**
 * Appends one event to a slot's live log (spec-phase-2 §7). Loads the log, replays it with the new
 * event (`replay()`) and calls `live_apply` only if the event is valid. `live_apply` checks the
 * scorer lock and refuses the event if the log changed after it was read (`expectedSeq`), so the
 * log validated here is the one written. Confirming or reopening a slot, and the first event of a
 * match, change the results, so they expire the public caches.
 */
export async function applyLiveEvent(input: unknown): Promise<LiveApplyState> {
  const viewer = await requireStaff();
  const parsed = parseLiveEventInput(input);
  if (!parsed) return { error: 'invalid' };
  const { slotId, expectedSeq, event, clientAt } = parsed;
  if (event.kind === 'reopened' && viewer.role !== 'btc') return { error: 'notScorer' };

  const supabase = await createClient();
  const loaded = await loadLiveSlot(supabase, slotId).catch(() => undefined);
  if (loaded === undefined) return { error: 'failed' };
  if (!loaded) return { error: 'invalid' };
  const { slot, match, settings, events, previous } = loaded;
  if (!settings.live_scoring) return { error: 'off' };

  const setup = liveSlotSetup({ slot, match, previous });
  if (!setup) return { error: 'closed' };
  const check = checkLiveEvent(setup, events, { expectedSeq, event }, settings);
  if (!check.ok) {
    return check.code === 'SEQ_OUT_OF_ORDER' ? { error: 'changed' } : { error: 'rejected', code: check.code };
  }

  const { data: seq, error } = await supabase.rpc('live_apply', {
    p_slot_id: slotId,
    p_expected_seq: expectedSeq,
    p_kind: event.kind,
    p_payload: eventPayload(event),
    p_client_at: clientAt,
  });
  if (error) {
    switch (error.code) {
      case '42501':
        return { error: 'notScorer' };
      case '40001':
        return { error: 'changed' };
      case 'P0001':
        return { error: 'closed' };
      case '22023':
      case 'P0002':
        return { error: 'invalid' };
      default:
        return { error: 'failed' };
    }
  }

  if (changesPublicResults(event.kind, match.status === 'lineup_locked')) invalidatePublicData();
  return { ok: true, seq };
}
