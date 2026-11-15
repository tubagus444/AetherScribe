import { prepareInternalBackup, type PreparedInternalBackup } from '@/src/lib/internalBackupPreparation';
import { BACKUP_LIMITS } from '@/src/lib/backupLimits';

// Character estimate avoids serializing a large snapshot just to choose a thread.
export const BACKUP_WORKER_THRESHOLD = 256 * 1024;
export function isLargeBackup(input: unknown): boolean {
  let size = 0;
  const pending: unknown[] = [input];
  const seen = new Set<object>();
  while (pending.length) {
    const value = pending.pop();
    if (typeof value === 'string') size += value.length;
    else if (typeof value === 'object' && value !== null && !seen.has(value)) {
      seen.add(value);
      for (const child of Object.values(value)) pending.push(child);
    }
    if (size >= BACKUP_WORKER_THRESHOLD) return true;
  }
  return false;
}

export function createBackupWorker(): Worker {
  return new Worker(new URL('../workers/backupWorker.ts', import.meta.url), { type: 'module' });
}

export function requestBackupWorker(input: unknown, create = createBackupWorker, timeoutMs = 30000): Promise<PreparedInternalBackup> {
  return new Promise((resolve, reject) => {
    let worker: Worker | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let settled = false;
    const finish = (result?: PreparedInternalBackup) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (worker) { worker.onmessage = worker.onerror = worker.onmessageerror = null; worker.terminate(); }
      if (result) resolve(result); else reject(new Error('Worker backup tidak tersedia.'));
    };
    try {
      worker = create();
      worker.onmessage = (event: MessageEvent<unknown>) => {
        const value = event.data;
        if (typeof value !== 'object' || value === null || !('type' in value) || value.type !== 'prepared' || !('bytes' in value) || !(value.bytes instanceof ArrayBuffer)) { finish(); return; }
        const bytes = new Uint8Array(value.bytes);
        if (bytes.length < 18 || bytes.length > BACKUP_LIMITS.fileBytes || bytes[0] !== 0x1f || bytes[1] !== 0x8b || bytes[2] !== 8) { finish(); return; }
        finish({ data: bytes, size: bytes.length, compressed: true });
      };
      worker.onerror = event => { event.preventDefault(); finish(); };
      worker.onmessageerror = () => finish();
      timer = setTimeout(() => finish(), timeoutMs);
      worker.postMessage(input);
    } catch { finish(); }
  });
}

export async function prepareAutoBackup(input: unknown): Promise<PreparedInternalBackup> {
  if (typeof Worker !== 'undefined' && typeof CompressionStream !== 'undefined' && typeof crypto !== 'undefined' && crypto.subtle && isLargeBackup(input)) {
    try { return await requestBackupWorker(input); }
    catch { console.warn('[Backup] Worker gagal; memakai pemrosesan lokal.'); }
  }
  return prepareInternalBackup(input, 'auto');
}

// Serialize preparation, persistence and retention together, including safety snapshots.
let tail: Promise<void> = Promise.resolve();
export function serializeInternalBackup(job: () => Promise<void>): Promise<void> {
  const result = tail.then(job);
  tail = result.catch(() => {});
  return result;
}
