import { db } from '@/src/db';
import type { CodexCoverImage } from '@/src/types';
import type { BackupCoverRecord } from '@/src/lib/backupFormat';
import { backupChecksum } from '@/src/lib/backupEnvelope';
import { blobToDataUrl, dataUrlToBlob } from '@/src/lib/blobCodec';
import { verifyEmbeddedImage } from '@/src/lib/portableBackup';

export async function serializeCoverImages(images: CodexCoverImage[], references = false): Promise<BackupCoverRecord[]> {
  const records: BackupCoverRecord[] = [];
  for (const { id, imageBlob, ...image } of images) {
    const imageDataUrl = await blobToDataUrl(imageBlob);
    const imageAssetId = await backupChecksum(imageDataUrl);
    if (id === undefined || !imageAssetId) throw new Error('Tidak dapat membuat identitas gambar sampul untuk cadangan.');
    records.push({ ...image, id, imageAssetId, ...(references ? {} : { imageDataUrl }) });
  }
  return records;
}

export async function deserializeCoverImages(records: BackupCoverRecord[] = [], allowReferences = false): Promise<CodexCoverImage[]> {
  const rows: CodexCoverImage[] = [];
  for (const { imageDataUrl, imageAssetId, ...record } of records) {
    let imageBlob: Blob;
    if (imageDataUrl) {
      await verifyEmbeddedImage(imageDataUrl, imageAssetId);
      imageBlob = await dataUrlToBlob(imageDataUrl);
    } else {
      const current = allowReferences ? await db.codexCovers.get({ codexId: record.codexId, kind: record.kind }) : undefined;
      if (!current || current.projectId !== record.projectId || await backupChecksum(await blobToDataUrl(current.imageBlob)) !== imageAssetId) {
        throw new Error('Gambar sampul Codex dari cadangan ini tidak tersedia. Gunakan cadangan lengkap.');
      }
      imageBlob = current.imageBlob;
    }
    rows.push({ ...record, imageBlob });
  }
  return rows;
}
