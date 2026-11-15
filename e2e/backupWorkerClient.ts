import type { BackupData } from '../src/services/backupService';
import { prepareAuto } from './backupPreparation';

let active = 0;
export function activeRequests() { return active; }
// Experimental client only. Each request owns its worker, listeners and timeout.
export function requestWorker(data: BackupData, create = createExperimentalWorker, timeoutMs = 30000): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    let worker: Worker | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let settled = false;
    active++;
    const finish = (error?: Error, bytes?: ArrayBuffer) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (worker) { worker.onmessage = worker.onerror = worker.onmessageerror = null; worker.terminate(); }
      active--;
      if (error) reject(error); else if (bytes) resolve(bytes); else reject(new Error('Missing worker bytes'));
    };
    try {
      worker = create();
      worker.onmessage = event => event.data?.bytes instanceof ArrayBuffer ? finish(undefined, event.data.bytes) : finish(new Error('Invalid worker response'));
      worker.onerror = event => { event.preventDefault(); finish(new Error('Worker crashed')); };
      worker.onmessageerror = () => finish(new Error('Worker message error'));
      timer = setTimeout(() => finish(new Error('Worker timed out')), timeoutMs);
      worker.postMessage(data);
    } catch { finish(new Error('Worker unavailable')); }
  });
}
export function createExperimentalWorker() { return new Worker(new URL('./backupExperimentWorker.ts', import.meta.url), { type: 'module' }); }

export async function experimentalFallback(data: BackupData, create?: () => Worker, timeoutMs?: number) {
  try { return { bytes: await requestWorker(data, create, timeoutMs), fallback: false }; }
  catch { return { bytes: await prepareAuto(data), fallback: true }; }
}
