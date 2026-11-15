import { prepareInternalBackup } from '@/src/lib/internalBackupPreparation';

self.onmessage = async (event: MessageEvent<unknown>) => {
  try {
    const result = await prepareInternalBackup(event.data, 'auto');
    if (!(result.data instanceof Uint8Array)) throw new Error('Worker requires gzip');
    self.postMessage({ type: 'prepared', bytes: result.data.buffer }, { transfer: [result.data.buffer] });
  } catch {
    self.postMessage({ type: 'failed' });
  }
};
