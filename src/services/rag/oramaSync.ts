import { CodexEntry } from '@/src/types';
import { db } from '@/src/db';

// OramaWorker instance
let worker: Worker | null = null;
let messageIdCounter = 0;
const SEARCH_TIMEOUT_MS = 15000;

interface PendingRequest {
  resolve: (val: any) => void;
  reject: (err: any) => void;
  timeoutId: ReturnType<typeof setTimeout>;
}
const pendingRequests = new Map<number, PendingRequest>();

// Reject SEMUA request tertunda agar promise tidak menggantung saat worker crash. (RG1/RG7)
function rejectAllPending(reason: string) {
  pendingRequests.forEach(({ reject, timeoutId }) => {
    clearTimeout(timeoutId);
    reject(new Error(reason));
  });
  pendingRequests.clear();
}

let lastCrashTime = 0;
let hooksInstalled = false;
const mutationReads = new Set<Promise<void>>();
const dirtyTransactions = new WeakMap<object, Set<number>>();
function scheduleCommitted(transaction: any, key: number) {
  const existing = dirtyTransactions.get(transaction);
  if (existing) { existing.add(key); return; }
  const keys = new Set([key]);
  dirtyTransactions.set(transaction, keys);
  transaction.on('complete', () => { for (const id of keys) indexCommitted(id); });
}
function indexCommitted(key: number) {
  const pending = db.codex.get(key).then(entry => {
    if (entry) oramaSync.updateEntry(entry);
  }).catch(error => console.error('[Orama] Post-commit index failed:', error));
  mutationReads.add(pending);
  void pending.finally(() => mutationReads.delete(pending));
}

function getWorker(): Worker {
  if (!worker) {
    if (Date.now() - lastCrashTime < 2000) {
      throw new Error('Orama worker is crash-looping. Please wait before retrying.');
    }
    worker = new Worker(new URL('./oramaWorker.ts', import.meta.url), { type: 'module' });

    worker.onerror = (error) => {
      lastCrashTime = Date.now();
      console.error('[Orama] Worker error:', error.message);
      // Jangan biarkan caller menggantung: gagalkan semua request lalu reset worker
      // (akan dibuat ulang pada pemakaian berikutnya). Tidak me-redispatch error ke window.
      rejectAllPending('Orama worker error/crash');
      try { worker?.terminate(); } catch (e) { /* noop */ }
      worker = null;
    };
    worker.onmessageerror = () => {
      lastCrashTime = Date.now();
      console.error('[Orama] Worker Message Error');
      rejectAllPending('Orama worker message error');
      try { worker?.terminate(); } catch (e) { /* noop */ }
      worker = null;
    };

    worker.onmessage = (e) => {
      const { type, id, result, error, op, payload, retry } = e.data;
      if (type === 'SEARCH_RESULT' && id !== undefined && pendingRequests.has(id)) {
        const pending = pendingRequests.get(id)!;
        clearTimeout(pending.timeoutId);
        pendingRequests.delete(id);
        if (error) pending.reject(new Error(error));
        else pending.resolve(result);
      } else if (type === 'MUTATION_ERROR') {
        // RG3: kegagalan mutasi indeks tak lagi senyap. Coba ulang SEKALI (menyembuhkan
        // kegagalan transien); bila masih gagal, log peringatan agar drift indeks fallback
        // diketahui (Orama hanya jalur RAG cadangan — tak memblokir fitur utama).
        const attempt = (retry || 0) + 1;
        if (attempt <= 1) {
          try { getWorker().postMessage({ type: op, payload, retry: attempt }); } catch { /* worker mati */ }
        } else {
          console.warn(`[Orama] Mutasi ${op} gagal setelah ${attempt} percobaan; indeks pencarian fallback mungkin melenceng:`, error);
        }
      }
    };
  }
  return worker;
}

export const oramaSync = {
  setupHooks: () => {
    // Only set up hooks if we are in the main window to avoid nested worker loops
    if (typeof window !== 'undefined' && !hooksInstalled) {
      hooksInstalled = true;
      db.codex.hook('creating', function (_primKey, obj, transaction) {
        this.onsuccess = (generatedKey) => {
          scheduleCommitted(transaction, generatedKey);
        };
      });

      db.codex.hook('updating', (modifications, primKey, obj, transaction) => {
        scheduleCommitted(transaction, primKey);
      });

      db.codex.hook('deleting', (primKey, obj, transaction) => {
        transaction.on('complete', () => {
          oramaSync.removeEntry(primKey);
        });
      });
    }
  },
  init: (projectId: number) => {
    getWorker().postMessage({ type: 'INIT_ORAMA', payload: { projectId } });
  },
  indexEntry: (entry: CodexEntry) => {
    getWorker().postMessage({ type: 'INDEX_ENTRY', payload: { entry } });
  },
  updateEntry: (entry: CodexEntry) => {
    getWorker().postMessage({ type: 'UPDATE_ENTRY', payload: { entry } });
  },
  removeEntry: (dexieId: number) => {
    getWorker().postMessage({ type: 'REMOVE_ENTRY', payload: { dexieId } });
  },
  searchWithScores: (projectId: number, query: string, limit = 5): Promise<{ entry: CodexEntry; score: number }[]> => requestSearch('SEARCH_WITH_SCORES', { projectId, query, limit }),
  search: (query: string, limit: number = 5): Promise<CodexEntry[]> => requestSearch('SEARCH', { query, limit })
};

async function requestSearch(type: string, payload: unknown): Promise<any> {
    await Promise.all(mutationReads);
    return new Promise((resolve, reject) => {
      const id = ++messageIdCounter;
      const timeoutId = setTimeout(() => {
        if (pendingRequests.has(id)) {
          pendingRequests.delete(id);
          reject(new Error('Orama search timed out'));
        }
      }, SEARCH_TIMEOUT_MS);
      pendingRequests.set(id, { resolve, reject, timeoutId });
      try {
        getWorker().postMessage({ id, type, payload });
      } catch (err) {
        clearTimeout(timeoutId);
        pendingRequests.delete(id);
        reject(err);
      }
    });
}
