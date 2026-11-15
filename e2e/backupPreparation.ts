import { validateBackup } from '../src/lib/backupValidation';
import { assembleBackupJson } from '../src/lib/backupEnvelope';
import type { BackupData } from '../src/services/backupService';

// Experimental auto-backup preparation only; no database or editor dependencies.
export async function prepareAuto(data: BackupData): Promise<ArrayBuffer> {
  validateBackup(data, data.scope ?? 'all');
  const maps = (data.data.maps ?? []).map(map => {
    const { imageDataUrl, ...rest } = map;
    if (imageDataUrl && !rest.imageAssetId) throw new Error('Experiment requires image asset identity');
    return rest;
  });
  const lean = { ...data.data, ...(data.data.maps?.length ? { maps } : {}) };
  const json = JSON.stringify(lean);
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(json));
  const checksum = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
  const meta: Record<string, unknown> = { version: data.version, timestamp: data.timestamp };
  if (data.scope) meta.scope = data.scope;
  if (data.projectName) meta.projectName = data.projectName;
  if (data.version >= 8) meta.imageMode = 'references';
  meta.checksum = checksum;
  const text = assembleBackupJson(meta, json);
  const compressed = await new Response(new Blob([new TextEncoder().encode(text)]).stream().pipeThrough(new CompressionStream('gzip'))).blob();
  return compressed.arrayBuffer();
}
