import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { LiveOutbox, memoryOutboxStore, type QueuedEvent, type SendOutcome } from './live-outbox';

const MATCH = 'match-1';
const SLOT = 'slot-1';

const point = (expectedSeq: number, side: 'home' | 'away' = 'home') => ({
  slotId: SLOT,
  slotNo: 1,
  expectedSeq,
  event: { kind: 'point' as const, payload: { side } },
  clientAt: `2026-11-12T08:00:0${expectedSeq}.000Z`,
});

/** A server that answers from a script, then `ok`; it records every send. */
function server(script: SendOutcome[] = []) {
  const sent: number[] = [];
  const send = vi.fn(async (item: QueuedEvent) => {
    sent.push(item.expectedSeq);
    return script.shift() ?? 'ok';
  });
  return { sent, send };
}

function setup(script?: SendOutcome[], store = memoryOutboxStore()) {
  const { sent, send } = server(script);
  const onDrained = vi.fn();
  const onDropped = vi.fn();
  const onChange = vi.fn();
  let clock = 1000;
  const outbox = new LiveOutbox({
    matchId: MATCH,
    store,
    send,
    onDrained,
    onDropped,
    onChange,
    retryFirstMs: 1000,
    retryMaxMs: 4000,
    now: () => clock++,
  });
  return { outbox, store, sent, send, onDrained, onDropped, onChange };
}

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('LiveOutbox ordering', () => {
  it('sends one event at a time, in the order they were queued', async () => {
    const { outbox, sent, send, onDrained } = setup();
    let release!: () => void;
    send.mockImplementationOnce(async (item) => {
      sent.push(item.expectedSeq);
      await new Promise<void>((resolve) => (release = resolve));
      return 'ok';
    });
    outbox.enqueue(point(1));
    outbox.enqueue(point(2));
    outbox.enqueue(point(3));
    await vi.advanceTimersByTimeAsync(0);
    // The first send is still in flight: nothing else went out.
    expect(sent).toEqual([1]);
    expect(outbox.snapshot.pending).toBe(3);
    release();
    await vi.advanceTimersByTimeAsync(0);
    expect(sent).toEqual([1, 2, 3]);
    expect(outbox.snapshot).toEqual({ pending: 0, offline: false });
    expect(onDrained).toHaveBeenCalledTimes(1);
  });

  it('keeps each event in the store until it is written', async () => {
    const { outbox, store } = setup(['offline']);
    outbox.enqueue(point(1));
    outbox.enqueue(point(2));
    await vi.advanceTimersByTimeAsync(0);
    await outbox.flushed();
    expect([...store.rows.values()].map((item) => item.expectedSeq)).toEqual([1, 2]);
    await vi.advanceTimersByTimeAsync(1000);
    await outbox.flushed();
    expect(store.rows.size).toBe(0);
  });
});

describe('LiveOutbox retry', () => {
  it('retries a failed send with backoff and shows offline until a send goes through', async () => {
    const { outbox, sent } = setup(['offline', 'offline', 'offline', 'offline']);
    outbox.enqueue(point(1));
    await vi.advanceTimersByTimeAsync(0);
    expect(sent).toEqual([1]);
    expect(outbox.snapshot).toEqual({ pending: 1, offline: true });
    await vi.advanceTimersByTimeAsync(999);
    expect(sent).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1); // 1 s
    await vi.advanceTimersByTimeAsync(2000); // 2 s
    await vi.advanceTimersByTimeAsync(4000); // 4 s
    expect(sent).toHaveLength(4);
    await vi.advanceTimersByTimeAsync(4000); // capped at 4 s
    expect(sent).toHaveLength(5);
    expect(outbox.snapshot).toEqual({ pending: 0, offline: false });
  });

  it('treats a thrown send as offline, and retries a server failure without the offline badge', async () => {
    const { outbox, send } = setup();
    send.mockRejectedValueOnce(new TypeError('Failed to fetch')).mockResolvedValueOnce('retry');
    outbox.enqueue(point(1));
    await vi.advanceTimersByTimeAsync(0);
    expect(outbox.snapshot.offline).toBe(true);
    await vi.advanceTimersByTimeAsync(1000);
    expect(outbox.snapshot).toEqual({ pending: 1, offline: false });
    await vi.advanceTimersByTimeAsync(2000);
    expect(outbox.snapshot.pending).toBe(0);
    expect(send).toHaveBeenCalledTimes(3);
  });

  it('retries at once when the network comes back', async () => {
    const { outbox, sent } = setup(['offline', 'offline']);
    outbox.enqueue(point(1));
    await vi.advanceTimersByTimeAsync(1000);
    expect(sent).toHaveLength(2);
    outbox.setNetwork(false);
    expect(outbox.snapshot.offline).toBe(true);
    outbox.setNetwork(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(sent).toHaveLength(3);
    expect(outbox.snapshot).toEqual({ pending: 0, offline: false });
  });

  it('stops sending when stopped, and keeps the store', async () => {
    const { outbox, store, sent } = setup(['offline']);
    outbox.enqueue(point(1));
    await vi.advanceTimersByTimeAsync(0);
    outbox.stop();
    await vi.advanceTimersByTimeAsync(10_000);
    await outbox.flushed();
    expect(sent).toHaveLength(1);
    expect(store.rows.size).toBe(1);
  });
});

describe('LiveOutbox rejection', () => {
  it.each(['notScorer', 'conflict'] as const)(
    'drops the whole queue on %s and lists what was not sent',
    async (reason) => {
      const { outbox, store, sent, onDropped, onDrained } = setup(['ok', reason]);
      outbox.enqueue(point(1));
      outbox.enqueue(point(2));
      outbox.enqueue(point(3, 'away'));
      await vi.advanceTimersByTimeAsync(0);
      await outbox.flushed();
      expect(sent).toEqual([1, 2]);
      expect(onDropped).toHaveBeenCalledTimes(1);
      const [gotReason, unsent] = onDropped.mock.calls[0] as [string, QueuedEvent[]];
      expect(gotReason).toBe(reason);
      expect(unsent.map((item) => item.expectedSeq)).toEqual([2, 3]);
      expect(outbox.snapshot.pending).toBe(0);
      expect(store.rows.size).toBe(0);
      expect(onDrained).not.toHaveBeenCalled();
    },
  );

  it('drops a queue the caller refuses, without sending it', async () => {
    const store = memoryOutboxStore();
    const first = setup(['offline'], store);
    first.outbox.enqueue(point(1));
    await vi.advanceTimersByTimeAsync(0);
    first.outbox.stop();
    await first.outbox.flushed();

    const second = setup([], store);
    const restored = await second.outbox.restore();
    expect(restored.map((item) => item.expectedSeq)).toEqual([1]);
    second.outbox.drop('notScorer');
    await vi.advanceTimersByTimeAsync(0);
    await second.outbox.flushed();
    expect(second.sent).toEqual([]);
    expect(second.onDropped).toHaveBeenCalledWith('notScorer', restored);
    expect(store.rows.size).toBe(0);
  });
});

describe('LiveOutbox restore', () => {
  it('reloads the stored queue in tap order and sends it before new events', async () => {
    const store = memoryOutboxStore();
    const first = setup(['offline'], store);
    first.outbox.enqueue(point(1));
    first.outbox.enqueue(point(2));
    first.outbox.enqueue(point(3));
    await vi.advanceTimersByTimeAsync(0);
    first.outbox.stop();
    await first.outbox.flushed();

    const second = setup([], store);
    const restored = await second.outbox.restore();
    expect(restored.map((item) => item.expectedSeq)).toEqual([1, 2, 3]);
    expect(second.outbox.snapshot.pending).toBe(3);
    second.outbox.enqueue(point(4));
    await vi.advanceTimersByTimeAsync(0);
    expect(second.sent).toEqual([1, 2, 3, 4]);
    await second.outbox.flushed();
    expect(store.rows.size).toBe(0);
  });

  it('removes from the store the events the server already holds', async () => {
    const store = memoryOutboxStore();
    const first = setup(['offline'], store);
    first.outbox.enqueue(point(1));
    first.outbox.enqueue(point(2));
    await vi.advanceTimersByTimeAsync(0);
    first.outbox.stop();
    await first.outbox.flushed();

    const second = setup([], store);
    const restored = await second.outbox.restore((item) => item.expectedSeq === 1);
    expect(restored.map((item) => item.expectedSeq)).toEqual([2]);
    await second.outbox.flushed();
    expect([...store.rows.values()].map((item) => item.expectedSeq)).toEqual([2]);
  });

  it('gives an empty queue when the store cannot be read, and still queues in memory', async () => {
    const broken = {
      load: () => Promise.reject(new Error('blocked')),
      put: () => Promise.reject(new Error('blocked')),
      remove: () => Promise.reject(new Error('blocked')),
      clear: () => Promise.reject(new Error('blocked')),
    };
    const { outbox, sent } = setup([], broken as unknown as ReturnType<typeof memoryOutboxStore>);
    expect(await outbox.restore()).toEqual([]);
    outbox.enqueue(point(1));
    await vi.advanceTimersByTimeAsync(0);
    expect(sent).toEqual([1]);
  });
});
