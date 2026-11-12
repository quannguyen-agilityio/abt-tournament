import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { applyLiveEvent, type LiveApplyState } from '@/app/[locale]/admin/(shell)/matches/[id]/live-actions';
import {
  LiveOutbox,
  type DropReason,
  type NewQueuedEvent,
  type OutboxSnapshot,
  type QueuedEvent,
  type SendOutcome,
} from '@/lib/live-outbox';
import { browserOutboxStore } from '@/lib/live-outbox-idb';

// How the scorer screen keeps in step with the server (spec-phase-2 §5, §8.1 Connection state): an
// ordered outbox kept in IndexedDB that sends one event at a time, a realtime subscription to the
// log, and a refresh that is throttled so a burst of events does not reload the page for every one.

export type { DropReason, QueuedEvent } from '@/lib/live-outbox';

/** One send through the server action, as the outbox reads it. A thrown call (no network) is offline. */
async function sendQueued(item: QueuedEvent): Promise<SendOutcome> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return 'offline';
  const { slotId, expectedSeq, event, clientAt } = item;
  const result: LiveApplyState = await applyLiveEvent({ slotId, expectedSeq, event, clientAt });
  if ('ok' in result) return 'ok';
  if (result.error === 'failed') return 'retry';
  return result.error === 'notScorer' ? 'notScorer' : 'conflict';
}

export interface OutboxHandlers {
  onDrained: () => void;
  onDropped: (reason: DropReason, unsent: QueuedEvent[]) => void;
  /**
   * The events an earlier page of this match left unsent (a reload, a closed tab). Return `true` to
   * send them, `false` to drop them (`onDropped` with `notScorer`).
   */
  onRestored: (items: QueuedEvent[]) => boolean;
  /** Whether the server already holds this event, so it is not restored. */
  isSent: (item: QueuedEvent) => boolean;
}

/**
 * The scorer's offline queue (`LiveOutbox`) in IndexedDB, for one match: it restores what an earlier
 * page left, follows the browser's online state, and stops sending when the screen closes. `ready`
 * turns true once the stored queue is restored; events queued before that would take a wrong `seq`.
 */
export function useOutbox(matchId: string, handlers: OutboxHandlers) {
  const latest = useRef(handlers);
  const outboxRef = useRef<LiveOutbox | null>(null);
  const [snapshot, setSnapshot] = useState<OutboxSnapshot>({ pending: 0, offline: false });
  const [ready, setReady] = useState(false);

  useEffect(() => {
    latest.current = handlers;
  });

  useEffect(() => {
    const outbox = new LiveOutbox({
      matchId,
      store: browserOutboxStore(),
      send: sendQueued,
      onChange: setSnapshot,
      onDrained: () => latest.current.onDrained(),
      onDropped: (reason, unsent) => latest.current.onDropped(reason, unsent),
    });
    outboxRef.current = outbox;
    outbox.setNetwork(navigator.onLine);
    const online = () => outbox.setNetwork(true);
    const offline = () => outbox.setNetwork(false);
    window.addEventListener('online', online);
    window.addEventListener('offline', offline);
    let active = true;
    void outbox
      .restore((item) => latest.current.isSent(item))
      .then((items) => {
        if (!active) return;
        if (items.length > 0) {
          if (latest.current.onRestored(items)) outbox.resume();
          else outbox.drop('notScorer');
        }
        setReady(true);
      });
    return () => {
      active = false;
      outbox.stop();
      if (outboxRef.current === outbox) outboxRef.current = null;
      window.removeEventListener('online', online);
      window.removeEventListener('offline', offline);
    };
  }, [matchId]);

  const enqueue = useCallback((item: NewQueuedEvent) => {
    outboxRef.current?.enqueue(item);
  }, []);

  return { enqueue, ready, pending: snapshot.pending, offline: snapshot.offline };
}

/** `router.refresh()` at most once per `intervalMs`: the first call runs now, a later one waits for the end of the window. */
export function useThrottledRefresh(intervalMs: number) {
  const router = useRouter();
  const last = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  return useCallback(() => {
    const wait = last.current + intervalMs - Date.now();
    if (wait <= 0) {
      last.current = Date.now();
      router.refresh();
      return;
    }
    if (timer.current) return;
    timer.current = setTimeout(() => {
      timer.current = undefined;
      last.current = Date.now();
      router.refresh();
    }, wait);
  }, [router, intervalMs]);
}

/**
 * Calls `onInsert` with the author of every new event of the given slots (Supabase Realtime,
 * `postgres_changes` on `live_event`, through the user's own session so RLS applies).
 */
export function useLiveRealtime(slotIds: readonly string[], onInsert: (createdBy: string | null) => void) {
  const latest = useRef(onInsert);
  useEffect(() => {
    latest.current = onInsert;
  });
  const key = slotIds.join(',');

  useEffect(() => {
    if (!key) return;
    const supabase = createClient();
    const channel = supabase
      .channel(`live-event-${key.slice(0, 40)}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'live_event', filter: `match_slot_id=in.(${key})` },
        (payload) => {
          const createdBy = (payload.new as { created_by?: string | null }).created_by ?? null;
          latest.current(createdBy);
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [key]);
}
