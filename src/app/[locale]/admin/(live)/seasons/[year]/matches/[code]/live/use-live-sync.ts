import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { NewLiveEvent } from '@/lib/live-scoring';
import { applyLiveEvent, type LiveApplyState } from '@/app/[locale]/admin/(shell)/matches/[id]/live-actions';

// How the scorer screen keeps in step with the server (spec-phase-2 §5, §8.1 Connection state): an
// ordered outbox that sends one event at a time, a realtime subscription to the log, and a refresh
// that is throttled so a burst of events does not reload the page for every one.

/** One event waiting to be sent: the slot's `seq` it takes, and when the scorer tapped. */
export interface QueuedEvent {
  slotId: string;
  expectedSeq: number;
  event: NewLiveEvent;
  clientAt: string;
}

/** Why the outbox gave up on its queue: the lock moved, or the server refused an event (the log is no longer ours). */
export type DropReason = 'notScorer' | 'conflict';

const RETRY_FIRST_MS = 1000;
const RETRY_MAX_MS = 10_000;

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Sends the queued events strictly in order, one at a time. A network or server failure keeps the
 * event and retries it with backoff (1 s, 2 s, 4 s, up to 10 s); any answer that says the event can
 * never be accepted drops the whole queue, since every later event builds on it.
 */
export function useOutbox(handlers: { onDrained: () => void; onDropped: (reason: DropReason) => void }) {
  const queue = useRef<QueuedEvent[]>([]);
  const running = useRef(false);
  const alive = useRef(true);
  const latest = useRef(handlers);
  const [count, setCount] = useState(0);

  useEffect(() => {
    latest.current = handlers;
  });
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const run = useCallback(async () => {
    if (running.current) return;
    running.current = true;
    let delay = RETRY_FIRST_MS;
    let sent = false;
    let dropped = false;
    while (alive.current && queue.current.length > 0) {
      let result: LiveApplyState | null;
      try {
        result = await applyLiveEvent(queue.current[0]);
      } catch {
        result = null;
      }
      if (!alive.current) break;
      if (result && 'ok' in result) {
        queue.current.shift();
        setCount(queue.current.length);
        sent = true;
        delay = RETRY_FIRST_MS;
        continue;
      }
      const error = result ? result.error : 'failed';
      if (error === 'failed') {
        await sleep(delay);
        delay = Math.min(delay * 2, RETRY_MAX_MS);
        continue;
      }
      queue.current = [];
      setCount(0);
      dropped = true;
      latest.current.onDropped(error === 'notScorer' ? 'notScorer' : 'conflict');
      break;
    }
    running.current = false;
    if (alive.current && sent && !dropped && queue.current.length === 0) latest.current.onDrained();
  }, []);

  const enqueue = useCallback(
    (item: QueuedEvent) => {
      queue.current.push(item);
      setCount(queue.current.length);
      void run();
    },
    [run],
  );

  return { enqueue, pending: count };
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
