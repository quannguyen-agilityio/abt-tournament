import type { NewLiveEvent } from './live-scoring';

// The scorer's offline event queue (spec-phase-2 §8.1 Connection state). Events are kept in a
// store that survives a reload (IndexedDB in the browser) and sent strictly in order, one at a time.
// A send that fails on the network or the server is retried with backoff; an answer that says the
// event can never be accepted drops the whole queue, since every later event builds on it. This file
// has no browser API in it, so the queue logic is tested with an in-memory store.

/** One event waiting to be sent: the slot's `seq` it takes, and when the scorer tapped. */
export interface QueuedEvent {
  /** Unique key in the store. */
  id: string;
  matchId: string;
  slotId: string;
  /** The set or leg, to list what was not sent. */
  slotNo: number;
  expectedSeq: number;
  event: NewLiveEvent;
  /** The tap time from the device clock. With the author it identifies a resend (`isResentEvent`). */
  clientAt: string;
  /** Send order across the slots of the match: increasing, in the order the scorer tapped. */
  order: number;
}

export type NewQueuedEvent = Omit<QueuedEvent, 'id' | 'matchId' | 'order'>;

/** Why the queue was dropped: the lock moved, or the server refused an event (the log is no longer ours). */
export type DropReason = 'notScorer' | 'conflict';

/** What one send gave: written, try again later (server or network failure), or never. */
export type SendOutcome = 'ok' | 'retry' | 'offline' | DropReason;

/** Where the queue is kept between page loads. */
export interface OutboxStore {
  load(matchId: string): Promise<QueuedEvent[]>;
  put(item: QueuedEvent): Promise<void>;
  remove(id: string): Promise<void>;
  clear(matchId: string): Promise<void>;
}

export interface OutboxSnapshot {
  /** Events not yet written on the server. */
  pending: number;
  /** The device is offline, or the last send could not reach the server. */
  offline: boolean;
}

export interface OutboxOptions {
  matchId: string;
  store: OutboxStore;
  send: (item: QueuedEvent) => Promise<SendOutcome>;
  onChange?: (snapshot: OutboxSnapshot) => void;
  /** The queue was emptied by successful sends. */
  onDrained?: () => void;
  /** The queue was dropped; `unsent` lists its events, in order. */
  onDropped?: (reason: DropReason, unsent: QueuedEvent[]) => void;
  retryFirstMs?: number;
  retryMaxMs?: number;
  now?: () => number;
}

const byOrder = (a: QueuedEvent, b: QueuedEvent) => a.order - b.order;

export class LiveOutbox {
  private queue: QueuedEvent[] = [];
  private running = false;
  private stopped = false;
  private offline = false;
  private persisting: Promise<void> = Promise.resolve();
  private lastOrder = 0;
  private waitTimer: ReturnType<typeof setTimeout> | undefined;
  private waitDone: (() => void) | undefined;
  private delay: number;
  private readonly first: number;
  private readonly max: number;
  private readonly now: () => number;

  constructor(private readonly options: OutboxOptions) {
    this.first = options.retryFirstMs ?? 1000;
    this.max = options.retryMaxMs ?? 10_000;
    this.delay = this.first;
    this.now = options.now ?? Date.now;
  }

  get snapshot(): OutboxSnapshot {
    return { pending: this.queue.length, offline: this.offline };
  }

  /** The queued events, in send order. */
  get items(): readonly QueuedEvent[] {
    return this.queue;
  }

  /**
   * Loads what an earlier page left in the store, in send order, without sending it yet: the caller
   * decides whether to `resume()` or `drop()`. Events the server already holds (`isSent`) are
   * removed from the store. A store that cannot be read gives an empty queue.
   */
  async restore(isSent: (item: QueuedEvent) => boolean = () => false): Promise<QueuedEvent[]> {
    let stored: QueuedEvent[];
    try {
      stored = await this.options.store.load(this.options.matchId);
    } catch {
      return [];
    }
    if (this.stopped) return [];
    const known = new Set(this.queue.map((item) => item.id));
    const restored: QueuedEvent[] = [];
    for (const item of [...stored].sort(byOrder)) {
      if (known.has(item.id)) continue;
      if (isSent(item)) this.persist(() => this.options.store.remove(item.id));
      else restored.push(item);
    }
    this.queue = [...restored, ...this.queue].sort(byOrder);
    this.lastOrder = Math.max(this.lastOrder, ...this.queue.map((item) => item.order));
    this.notify();
    return restored;
  }

  /** Queues a new event after every queued one, stores it, and sends the queue. */
  enqueue(input: NewQueuedEvent): QueuedEvent {
    const order = Math.max(this.now(), this.lastOrder + 1);
    this.lastOrder = order;
    const item: QueuedEvent = {
      ...input,
      id: `${input.slotId}:${input.expectedSeq}:${order}`,
      matchId: this.options.matchId,
      order,
    };
    this.queue.push(item);
    this.persist(() => this.options.store.put(item));
    this.notify();
    void this.run();
    return item;
  }

  /** Sends what is queued. */
  resume(): void {
    void this.run();
  }

  /** Empties the queue and its store, and reports what was not sent. */
  drop(reason: DropReason): void {
    const unsent = this.queue;
    this.queue = [];
    this.persist(() => this.options.store.clear(this.options.matchId));
    this.wake();
    this.notify();
    this.options.onDropped?.(reason, unsent);
  }

  /** The browser's online state: offline shows at once; back online retries now. */
  setNetwork(online: boolean): void {
    if (!online) {
      this.setOffline(true);
      return;
    }
    this.setOffline(false);
    this.delay = this.first;
    this.wake();
  }

  /** Stops sending (the screen closed). The store keeps what is left. */
  stop(): void {
    this.stopped = true;
    this.wake();
  }

  /** Resolves when every store write so far is done. */
  flushed(): Promise<void> {
    return this.persisting;
  }

  private async run(): Promise<void> {
    if (this.running || this.stopped) return;
    this.running = true;
    let sent = false;
    let dropped = false;
    while (!this.stopped && this.queue.length > 0) {
      const item = this.queue[0];
      let outcome: SendOutcome;
      try {
        outcome = await this.options.send(item);
      } catch {
        outcome = 'offline';
      }
      if (this.stopped) break;
      // Dropped while the send was in flight.
      if (this.queue[0] !== item) continue;
      if (outcome === 'ok') {
        this.queue.shift();
        this.persist(() => this.options.store.remove(item.id));
        this.offline = false;
        this.delay = this.first;
        sent = true;
        this.notify();
        continue;
      }
      if (outcome === 'retry' || outcome === 'offline') {
        this.setOffline(outcome === 'offline');
        await this.wait(this.delay);
        this.delay = Math.min(this.delay * 2, this.max);
        continue;
      }
      dropped = true;
      this.drop(outcome);
      break;
    }
    this.running = false;
    if (!this.stopped && sent && !dropped && this.queue.length === 0) this.options.onDrained?.();
  }

  private wait(ms: number): Promise<void> {
    return new Promise((resolve) => {
      this.waitDone = resolve;
      this.waitTimer = setTimeout(() => this.wake(), ms);
    });
  }

  private wake(): void {
    clearTimeout(this.waitTimer);
    const done = this.waitDone;
    this.waitDone = undefined;
    done?.();
  }

  private setOffline(offline: boolean): void {
    if (this.offline === offline) return;
    this.offline = offline;
    this.notify();
  }

  private notify(): void {
    this.options.onChange?.(this.snapshot);
  }

  /** Store writes run one after another, in call order; a failing store keeps the queue in memory. */
  private persist(write: () => Promise<void>): void {
    this.persisting = this.persisting.then(write).catch(() => undefined);
  }
}

/** A store that lives as long as the page: for tests, and where IndexedDB is not available. */
export function memoryOutboxStore(): OutboxStore & { rows: Map<string, QueuedEvent> } {
  const rows = new Map<string, QueuedEvent>();
  return {
    rows,
    async load(matchId) {
      return [...rows.values()].filter((item) => item.matchId === matchId);
    },
    async put(item) {
      rows.set(item.id, item);
    },
    async remove(id) {
      rows.delete(id);
    },
    async clear(matchId) {
      for (const [id, item] of rows) if (item.matchId === matchId) rows.delete(id);
    },
  };
}
