import { describe, expect, it } from 'vitest';
import { backupChecksum } from './backupEnvelope';
import { BACKUP_FORMAT_VERSION } from './backupFormat';
import { compressBackup } from './internalBackupPreparation';
import { convertPortableBackup, readPortableBackup, serializePortableBackup, validatePortableBackup } from './portableBackup';
import { BACKUP_TABLES } from './tableCatalog';

const imageDataUrl = 'data:image/png;base64,iVBORw0KGgo=';
const project = { id: 10, name: 'Novel 🖋️', description: '', createdAt: 1, lastOpened: 2 };
const chapter = { id: 20, projectId: 10, title: 'Bab', content: '<p>Naskah</p>', order: 0, lastModified: 3 };
const map = { id: 30, projectId: 10, name: 'Atlas', width: 10, height: 10, createdAt: 4 };

describe('portable backup without database dependencies', () => {
  it('converts a legacy archive after verifying its original checksum and keeps author data and Atlas references', async () => {
    const data = {
      projects: [project], chapters: [{ ...chapter, listMetadata: ['derived'], futureField: 'keep' }], codex: [],
      snapshots: [{ id: 40, chapterId: 999, content: '<p>Draf historis</p>', label: 'Draf', timestamp: 5 }],
      maps: [{ ...map, imageDataUrl }, { ...map, id: 31, imageMissing: true }],
      mapMarkers: [{ id: 50, projectId: 10, mapId: 30, linkedMapId: 31, kind: 'pin', geometry: { x: .2, y: .3 }, createdAt: 6 }],
    };
    const legacy = { version: 7, timestamp: 1234, checksum: await backupChecksum(JSON.stringify(data)), data };
    const original = structuredClone(legacy);
    const converted = await convertPortableBackup(legacy);
    expect(legacy).toEqual(original);
    expect(converted).toMatchObject({ version: BACKUP_FORMAT_VERSION, timestamp: 1234, scope: 'all', imageMode: 'full' });
    expect(Object.keys(converted.data)).toEqual(BACKUP_TABLES);
    expect(converted.data.chapters).toEqual([{ ...chapter, futureField: 'keep' }]);
    expect(converted.data.snapshots).toEqual([{ ...data.snapshots[0], orphaned: true }]);
    expect(converted.data.mapMarkers).toEqual(data.mapMarkers);
    expect(converted.data.maps).toEqual([{ ...data.maps[0], imageAssetId: await backupChecksum(imageDataUrl) }, data.maps[1]]);
    expect(converted.checksum).toBe(await backupChecksum(JSON.stringify(converted.data)));

    const json = serializePortableBackup(converted, 2);
    expect(await readPortableBackup(new Blob([json]), 'all')).toEqual(converted);
    const gzip = await compressBackup(json);
    expect(gzip.compressed).toBe(true);
    expect(await readPortableBackup(gzip.blob)).toEqual(converted);

    await expect(convertPortableBackup({ ...legacy, checksum: '0'.repeat(64) })).rejects.toThrow(/integritas/);
  });

  it('rejects source-dependent assets, forged hashes, and unsupported versions', async () => {
    const input = { version: 7, timestamp: 1, data: { projects: [project], chapters: [chapter], codex: [], maps: [map] } };
    await expect(convertPortableBackup({ ...input, version: 9 })).rejects.toThrow(/versi 9 belum didukung/);
    await expect(validatePortableBackup(input)).rejects.toThrow(/Gambar peta.*tidak disertakan/);
    await expect(convertPortableBackup(input)).rejects.toThrow(/Gambar peta.*tidak disertakan/);

    const complete = await convertPortableBackup({
      ...input, data: { ...input.data, maps: [{ ...map, imageDataUrl }] },
    });
    const forged = structuredClone(complete);
    forged.data.maps![0].imageAssetId = '0'.repeat(64);
    forged.checksum = await backupChecksum(JSON.stringify(forged.data));
    await expect(validatePortableBackup(forged)).rejects.toThrow(/Identitas gambar/);
    await expect(convertPortableBackup(forged)).rejects.toThrow(/Identitas gambar/);

    const references = structuredClone(complete);
    delete references.data.maps![0].imageDataUrl;
    const internal = { ...references, imageMode: 'references' as const, checksum: await backupChecksum(JSON.stringify(references.data)) };
    expect(() => serializePortableBackup(internal)).toThrow(/gambar lengkap/);
    await expect(validatePortableBackup(internal)).rejects.toThrow(/gambar lengkap/);
    await expect(convertPortableBackup(internal)).rejects.toThrow(/Gambar peta.*tidak disertakan/);
  });

  it('keeps project scope and checks output size in UTF-8 bytes', async () => {
    const legacy = { version: 3, timestamp: 1, scope: 'project', projectName: project.name, data: { projects: [project], chapters: [chapter], codex: [] } };
    const converted = await convertPortableBackup(legacy);
    expect(converted).toMatchObject({ scope: 'project', projectName: project.name });
    await expect(validatePortableBackup(converted, 'project')).resolves.toEqual(converted);
    await expect(validatePortableBackup(converted, 'all')).rejects.toThrow(/Impor Novel/);

    const json = serializePortableBackup(converted);
    const bytes = new Blob([json]).size;
    expect(bytes).toBeGreaterThan(json.length);
    expect(() => serializePortableBackup(converted, undefined, bytes - 1)).toThrow(/Ukuran file/);
    expect(serializePortableBackup(converted, undefined, bytes)).toBe(json);
  });
});
