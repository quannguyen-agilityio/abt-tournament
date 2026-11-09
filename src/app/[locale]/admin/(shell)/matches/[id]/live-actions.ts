'use server';

import type { LiveRuleCode } from '@/domain/live';
import { DEFAULT_SEASON_SETTINGS, parseSeasonSettings } from '@/domain/settings';
import { requireStaff } from '@/lib/auth/session';
import {
  changesPublicResults,
  checkLiveEvent,
  eventPayload,
  liveSlotSetup,
  parseLiveClaimInput,
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

export type LiveClaimState =
  | { ok: true; scorerSince: string }
  | {
      error:
        | 'invalid'
        | 'off'
        // Not an active BTC member or referee.
        | 'notAllowed'
        // Someone claimed or took over the lock after the screen was loaded: reload and confirm again.
        | 'changed'
        // The lineups are not locked, or the match is over.
        | 'closed'
        | 'failed';
    };

/**
 * Claims the scorer lock of a match (spec-phase-2 §5): **Bắt đầu chấm trực tiếp** when nobody holds
 * it (`expectedScorerId` null), or **Nhận quyền chấm** after the confirmation (`expectedScorerId` is
 * the scorer the confirmation named). `live_claim` moves the lock only if it still matches, so two
 * claims at once leave exactly one scorer, and the match audit log records the move. The previous
 * scorer's next event is then refused (`applyLiveEvent` returns `notScorer`).
 */
export async function claimLiveScoring(input: unknown): Promise<LiveClaimState> {
  await requireStaff();
  const parsed = parseLiveClaimInput(input);
  if (!parsed) return { error: 'invalid' };
  const { matchId, expectedScorerId } = parsed;

  const supabase = await createClient();
  const { data: match, error: loadError } = await supabase
    .from('match')
    .select('season:season_id (settings)')
    .eq('id', matchId)
    .maybeSingle();
  if (loadError) return { error: 'failed' };
  if (!match?.season) return { error: 'invalid' };
  const settings = parseSeasonSettings(match.season.settings);
  if (!(settings.ok ? settings.settings : DEFAULT_SEASON_SETTINGS).live_scoring) return { error: 'off' };

  const { data: scorerSince, error } = await supabase.rpc('live_claim', {
    p_match_id: matchId,
    p_expected_scorer: expectedScorerId ?? undefined,
  });
  if (error) {
    switch (error.code) {
      case '42501':
        return { error: 'notAllowed' };
      case '40001':
        return { error: 'changed' };
      case 'P0001':
        return { error: 'closed' };
      case 'P0002':
        return { error: 'invalid' };
      default:
        return { error: 'failed' };
    }
  }
  return { ok: true, scorerSince };
}
