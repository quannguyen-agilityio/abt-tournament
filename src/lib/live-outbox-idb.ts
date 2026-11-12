import { memoryOutboxStore, type OutboxStore, type QueuedEvent } from './live-outbox';

// The scorer's offline queue in IndexedDB (spec-phase-2 §8.1), so a reload or a closed tab keeps
// the events that were not sent yet. One object store, keyed by the event id, with an index on the
// match. Browser only.

const DB_NAME = 'abt-live-scoring';
const DB_VERSION = 1;
const STORE = 'outbox';
const BY_MATCH = 'matchId';

let opening: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  opening ??= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id' }).createIndex(BY_MATCH, BY_MATCH);
      }
    };
    request.onsuccess = () => {
      const db = request.result;
      // Another tab upgrading the database closes this connection; the next call opens a new one.
      db.onversionchange = () => {
        db.close();
        opening = null;
      };
      resolve(db);
    };
    request.onerror = () => {
      opening = null;
      reject(request.error);
    };
    request.onblocked = () => {
      opening = null;
      reject(new Error('IndexedDB blocked'));
    };
  });
  return opening;
}

/** Runs `body` in one transaction and resolves with its result once the transaction is committed. */
async function inTransaction<T>(
  mode: IDBTransactionMode,
  body: (store: IDBObjectStore) => IDBRequest<T> | void,
): Promise<T> {
  const db = await openDb();
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const request = body(tx.objectStore(STORE));
    tx.oncomplete = () => resolve(request ? request.result : (undefined as T));
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

const idbStore: OutboxStore = {
  load: (matchId) =>
    inTransaction<QueuedEvent[]>(
      'readonly',
      (store) => store.index(BY_MATCH).getAll(matchId) as IDBRequest<QueuedEvent[]>,
    ),
  put: async (item) => {
    await inTransaction('readwrite', (store) => store.put(item));
  },
  remove: async (id) => {
    await inTransaction('readwrite', (store) => store.delete(id));
  },
  clear: async (matchId) => {
    await inTransaction('readwrite', (store) => {
      const keys = store.index(BY_MATCH).getAllKeys(matchId);
      keys.onsuccess = () => {
        for (const key of keys.result) store.delete(key);
      };
    });
  },
};

/** IndexedDB where the browser has it; otherwise (or on the server) a store in memory. */
export function browserOutboxStore(): OutboxStore {
  return typeof indexedDB === 'undefined' ? memoryOutboxStore() : idbStore;
}
