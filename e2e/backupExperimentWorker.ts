import { prepareAuto } from './backupPreparation';
import type { BackupData } from '../src/services/backupService';
self.onmessage = async (event: MessageEvent<BackupData>) => {
  try {
    const bytes = await prepareAuto(event.data);
    self.postMessage({ bytes }, { transfer: [bytes] });
  } catch {
    self.postMessage({ error: 'Experimental preparation failed' });
  }
};
