import { describe, it, expect, vi } from 'vitest';
import { isLargeBackup, requestBackupWorker, serializeInternalBackup, BACKUP_WORKER_THRESHOLD } from './internalBackupWorker';

describe('internal backup scheduling', () => {
  it('estimates nested strings without serializing, and handles cycles', () => {
    const data: Record<string, unknown> = { chapters: [{ content: 'x'.repeat(BACKUP_WORKER_THRESHOLD) }] };
    data.self = data;
    expect(isLargeBackup(data)).toBe(true);
    expect(isLargeBackup({ chapters: [{ content: 'short' }] })).toBe(false);
  });

  it('serializes whole jobs and recovers the queue after rejection', async () => {
    const calls: string[] = [];
    let release = () => {};
    const gate = new Promise<void>(resolve => { release = resolve; });
    const first = serializeInternalBackup(async () => { calls.push('first'); await gate; throw new Error('storage failed'); });
    const rejected = expect(first).rejects.toThrow('storage failed');
    const second = serializeInternalBackup(async () => { calls.push('second'); });
    await Promise.resolve();
    expect(calls).toEqual(['first']);
    release(); await rejected; await second;
    expect(calls).toEqual(['first', 'second']);
  });

  it('rejects startup failure', async () => {
    await expect(requestBackupWorker({}, () => { throw new Error('unavailable'); })).rejects.toThrow();
  });

  it('rejects timeout and terminates its worker', async () => {
    vi.useFakeTimers();
    const worker = { postMessage: vi.fn(), terminate: vi.fn(), onmessage: null, onerror: null, onmessageerror: null };
    try {
      const pending = requestBackupWorker({}, () => worker as unknown as Worker, 100);
      const rejected = expect(pending).rejects.toThrow();
      await vi.advanceTimersByTimeAsync(100); await rejected;
      expect(worker.terminate).toHaveBeenCalledOnce();
      expect(worker.onmessage).toBeNull();
    } finally { vi.useRealTimers(); }
  });
});
