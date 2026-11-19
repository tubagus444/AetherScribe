import 'fake-indexeddb/auto';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@/src/db';
import { backupService, type BackupData } from './backupService';
import { BACKUP_LIMITS } from '@/src/lib/backupLimits';
import { readBackupFile, readBackupResponse, readBoundedStream } from '@/src/lib/backupIO';
import { dataUrlToBlob } from '@/src/lib/blobCodec';
import { BACKUP_TABLES, TABLE_CATALOG, type BackupTableName } from '@/src/lib/tableCatalog';
import { dexieChapterStorage } from '@/src/adapters/dexieChapterStorage';
import { changeChapters, restoreChapterSnapshot } from './chapterOperations';

const image = 'data:image/png;base64,iVBORw0KGgo=';
const otherImage = 'data:image/png;base64,iVBORw0KGgox';
function legacy(version = 7): BackupData {
  return {
    version, timestamp: 1,
    data: {
      projects: [{ id: 2, name: 'Cadangan', description: '', createdAt: 1, lastOpened: 1 }],
      chapters: [{ id: 2, projectId: 2, title: 'Bab', content: '<p>backup</p>', order: 0, lastModified: 1 }],
      codex: [], bible: [], aiActions: [], snapshots: [], timeline: [], relationships: [], chatSessions: [],
    },
  };
}
async function seed() {
  await db.projects.add({ id: 1, name: 'Aktif', description: '', createdAt: 1, lastOpened: 1 });
  await db.chapters.add({ id: 1, projectId: 1, title: 'Bab aktif', content: '<p>draft aktif</p>', order: 0, lastModified: 1 });
  await db.maps.add({ id: 1, projectId: 1, name: 'Dunia', width: 100, height: 100, createdAt: 1, imageBlob: await dataUrlToBlob(image) });
}
async function latest(kind: string) {
  const rows = await db.backups.toArray();
  return rows.filter(r => r.kind === kind).at(-1)!;
}

beforeAll(() => {
  // Browser FileReader diganti adapter Blob native Node; tidak ada data pengguna.
  vi.stubGlobal('FileReader', class {
    result = ''; onload?: () => void; onerror?: () => void;
    readAsDataURL(blob: Blob) {
      void blob.arrayBuffer().then(bytes => {
        this.result = `data:${blob.type};base64,${Buffer.from(bytes).toString('base64')}`;
        this.onload?.();
      }).catch(() => this.onerror?.());
    }
  });
});
beforeEach(async () => { await seed(); });
afterEach(async () => {
  vi.restoreAllMocks();
  for (const table of db.tables) await table.clear();
});
afterAll(async () => { await db.delete(); vi.unstubAllGlobals(); });

it('DB04 requires exactly one catalog policy for every Dexie table', () => {
  expect(Object.keys(TABLE_CATALOG).sort()).toEqual(db.tables.map(table => table.name).sort());
  for (const [name, policy] of Object.entries(TABLE_CATALOG)) {
    if (policy.scope === 'project') expect(db.table(name).schema.idxByName).toHaveProperty('projectId');
    if (policy.scope === 'chapter') expect(db.table(name).schema.idxByName).toHaveProperty('chapterId');
  }
});

it('DB04 preserves the v8 export order and imports all exported table records', async () => {
  await db.codex.add({ id: 1, projectId: 1, name: 'Tokoh', category: 'character', aliases: [], tags: [], description: '' });
  await db.bible.add({ projectId: 1, key: 'Nada', instruction: 'Tenang' });
  await db.aiActions.add({ projectId: 1, label: 'Periksa', prompt: 'Periksa bab.' });
  await db.snapshots.add({ chapterId: 1, content: 'Versi lama', label: 'Draf', timestamp: 1 });
  await db.timeline.add({ projectId: 1, title: 'Peristiwa', description: '', type: 'plot', order: 0, chapterId: 1 });
  await db.relationships.add({ projectId: 1, sourceId: 1, targetId: 1, type: 'self' });
  await db.chatSessions.add({ projectId: 1, title: 'Diskusi', messages: [], lastMessageAt: 1, activeChapterId: 1 });
  await db.codexCategories.add({ projectId: 1, slug: 'faksi', label: 'Faksi', icon: 'users', color: 'indigo', order: 1 });
  await db.plotPromises.add({ projectId: 1, title: 'Janji', status: 'open', createdAt: 1, updatedAt: 1, codexId: 1 });
  await db.glossary.add({ projectId: 1, term: 'Istilah', createdAt: 1, updatedAt: 1 });
  await db.mapMarkers.add({ projectId: 1, mapId: 1, codexId: 1, kind: 'pin', geometry: { x: .5, y: .5 }, createdAt: 1 });
  await db.continuityTriage.add({ projectId: 1, findingId: 'gap-1', status: 'acknowledged', timestamp: 1 });

  // JSON order is part of the checksum produced by existing clients.
  const exportOrder = [
    'projects', 'chapters', 'codex', 'bible', 'aiActions', 'snapshots', 'timeline', 'relationships',
    'chatSessions', 'codexCategories', 'plotPromises', 'glossary', 'maps', 'mapMarkers', 'continuityTriage',
  ] as const satisfies readonly BackupTableName[];
  const source = await backupService.collectProjectData(1);
  expect(Object.keys(source.data)).toEqual(exportOrder);
  const { projectId } = await backupService.importProjectData(source);
  const imported = await backupService.collectProjectData(projectId);
  for (const name of BACKUP_TABLES) {
    expect(source.data[name], name).toHaveLength(1);
    expect(imported.data[name], name).toHaveLength(1);
  }
  expect(imported.data.maps?.[0].imageDataUrl).toBe(image);
  expect(imported.data.snapshots[0].chapterId).toBe(imported.data.chapters[0].id);
  expect(imported.data.mapMarkers?.[0].mapId).toBe(imported.data.maps?.[0].id);
});

it('DB04 clears derived indexes on restore and preserves workspace logs and backup history', async () => {
  await db.codex.add({ id: 1, projectId: 1, name: 'Tokoh', category: 'character', aliases: [], tags: [], description: '' });
  const cached = { id: 'old', projectId: 1, contentHash: 'old', embedding: new Float32Array([1]), lastUpdated: 1 };
  await db.embeddings.add({ ...cached, codexId: 1 });
  await db.sceneEmbeddings.add({ ...cached, chapterId: 1, chunkIndex: 0, snippet: '' });
  await db.errors.add({ id: 1, message: 'Existing log', timestamp: 1, type: 'info' });
  await db.aiUsageLogs.add({ id: 1, timestamp: 1, promptTokens: 1, completionTokens: 1, totalTokens: 2, provider: 'fixture', model: 'fixture', actionType: 'other' });
  const existingBackup = await db.backups.add({ timestamp: 1, data: '{}', size: 2, kind: 'pre-restore' });
  const exported = await backupService.collectAllData();
  for (const name of ['embeddings', 'sceneEmbeddings', 'errors', 'aiUsageLogs', 'backups']) {
    expect(exported.data).not.toHaveProperty(name);
  }
  await backupService.restoreData(legacy());
  expect(await db.embeddings.count()).toBe(0);
  expect(await db.sceneEmbeddings.count()).toBe(0);
  expect(await db.errors.get(1)).toMatchObject({ message: 'Existing log' });
  expect(await db.aiUsageLogs.get(1)).toMatchObject({ totalTokens: 2 });
  expect(await db.backups.get(existingBackup)).toBeDefined();
});

describe('F03 Atlas recovery', () => {
  it('restoring an internal backup does not discard an existing Atlas image', async () => {
    await backupService.saveToInternalDB(await backupService.collectAllData());
    await backupService.restoreFromBackup((await latest('auto')).id!);
    expect((await db.maps.get(1))!.imageBlob).toBeInstanceOf(Blob);
  });
  it('internal auto preserves matching live images and pre-restore includes complete images', async () => {
    const full = await backupService.collectAllData();
    expect(full.version).toBe(8);
    await backupService.saveToInternalDB(full);
    const auto = await latest('auto');
    const parsed = JSON.parse(await backupService.decodeInternalBackup(auto));
    expect(parsed.imageMode).toBe('references');
    expect(parsed.data.maps[0].imageDataUrl).toBeUndefined();
    expect(parsed.data.maps[0].imageAssetId).toMatch(/^[a-f0-9]{64}$/);
    await db.chapters.update(1, { content: '<p>sesudah backup</p>' });
    await backupService.restoreFromBackup(auto.id!);
    expect(await (await db.maps.get(1))!.imageBlob.text()).toBe(await (await dataUrlToBlob(image)).text());
    expect((await db.chapters.get(1))!.content).toBe('<p>draft aktif</p>');
    const undo = JSON.parse(await backupService.decodeInternalBackup(await latest('pre-restore')));
    expect(undo.imageMode).toBe('full');
    expect(undo.data.maps[0].imageDataUrl).toBe(image);
  });

  it('restores full images and can undo replacement/deletion with a complete pre-restore snapshot', async () => {
    const incoming = legacy();
    incoming.data.maps = [{ id: 2, projectId: 2, name: 'Peta lain', width: 50, height: 50, createdAt: 2, imageDataUrl: otherImage }];
    await backupService.restoreData(incoming);
    expect((await db.maps.get(2))!.imageBlob).toBeInstanceOf(Blob);
    expect(await db.maps.get(1)).toBeUndefined();
    const undo = await latest('pre-restore');
    await backupService.restoreFromBackup(undo.id!);
    expect((await db.projects.get(1))!.name).toBe('Aktif');
    expect(await (await db.maps.get(1))!.imageBlob.text()).toBe(await (await dataUrlToBlob(image)).text());
  });

  it('keeps legacy internal images with the same map identity', async () => {
    const backup = await backupService.collectAllData();
    backup.version = 7;
    delete backup.imageMode;
    delete backup.checksum;
    delete backup.data.maps![0].imageDataUrl;
    delete backup.data.maps![0].imageAssetId;
    await backupService.restoreData(backup);
    expect((await db.maps.get(1))!.imageBlob).toBeInstanceOf(Blob);
  });

  it.each(['deleted', 'replaced'])('rejects missing partial assets when %s, before any destructive action', async state => {
    const full = await backupService.collectAllData();
    await backupService.saveToInternalDB(full);
    const auto = await latest('auto');
    if (state === 'deleted') await db.maps.delete(1);
    else await db.maps.update(1, { imageBlob: await dataUrlToBlob(otherImage) });
    const clear = vi.spyOn(db.projects, 'clear');
    await expect(backupService.restoreFromBackup(auto.id!)).rejects.toThrow(/tidak tersedia/);
    expect(clear).not.toHaveBeenCalled();
    expect((await db.projects.get(1))!.name).toBe('Aktif');
    expect((await db.backups.toArray()).filter(r => r.kind === 'pre-restore')).toHaveLength(0);
  });

  it('rejects an image hash mismatch before snapshotting', async () => {
    const input = await backupService.collectAllData();
    delete input.checksum;
    input.data.maps![0].imageDataUrl = otherImage;
    await expect(backupService.restoreData(input)).rejects.toThrow(/Identitas gambar/);
    expect(await db.backups.count()).toBe(0);
    expect((await db.maps.get(1))!.imageBlob).toBeInstanceOf(Blob);
  });
});

describe('F04 restore boundary', () => {
  it('preserves an orphan snapshot in full, automatic, and pre-restore backups', async () => {
    const snapshot = { chapterId: 2, content: '<p>Draf bab lama</p>', label: 'Riwayat lama', timestamp: 1, auto: true };
    const id = await db.snapshots.add(snapshot);
    const detached = { ...snapshot, id, orphaned: true };
    const full = await backupService.collectAllData();
    expect(JSON.parse(backupService.serializeExternalBackup(full)).data.snapshots).toEqual([detached]);
    expect(await db.snapshots.get(id)).toEqual({ ...snapshot, id });

    await backupService.saveToInternalDB(full);
    await backupService.restoreFromBackup((await latest('auto')).id!);
    expect(await db.snapshots.get(id)).toEqual(detached);

    // Restore yang mengganti workspace tetap menyimpan teks lama pada titik undo.
    await backupService.restoreData(legacy());
    expect(await db.snapshots.count()).toBe(0);
    const undo = await latest('pre-restore');
    expect(JSON.parse(await backupService.decodeInternalBackup(undo)).data.snapshots).toEqual([detached]);
    await backupService.restoreFromBackup(undo.id!);

    // ID bab yang digunakan lagi tidak mengambil alih riwayat lama.
    await db.chapters.add({ id: 2, projectId: 1, title: 'Bab baru', order: 1, content: 'Teks baru', lastModified: 5 });
    expect(await dexieChapterStorage.read.readChapterSnapshots(2)).toEqual([]);
    expect(await dexieChapterStorage.transact('history', rows => rows.readAutomaticSnapshots(2))).toEqual([]);
    expect((await backupService.collectProjectData(1)).data.snapshots).toEqual([]);
    await expect(restoreChapterSnapshot(2, id)).rejects.toThrow(/tanpa bab induk/);
    await changeChapters(1, 'delete', 2);
    expect(await db.snapshots.get(id)).toEqual(detached);
  });

  it('normalizes an unmarked legacy orphan only after validating its original checksum', async () => {
    const input = legacy();
    const orphan = { id: 11, chapterId: 99, label: 'Legacy', content: 'Teks lama', timestamp: 1 };
    input.data.snapshots = [orphan];
    input.checksum = await backupService.computeChecksum(JSON.stringify(input.data));
    await backupService.restoreData(input);
    expect(input.data.snapshots).toEqual([orphan]);
    expect(await db.snapshots.get(11)).toEqual({ ...orphan, orphaned: true });
  });

  it.each([false, true])('rejects a detached snapshot in project import (marked: %s)', async marked => {
    const input = legacy();
    input.scope = 'project';
    input.data.snapshots = [{ id: 1, chapterId: marked ? 2 : 99, label: '', content: 'Legacy', timestamp: 1,
      ...(marked ? { orphaned: true as const } : {}) }];
    await expect(backupService.importProjectData(input)).rejects.toThrow(/snapshots.chapterId/);
    expect(await db.projects.count()).toBe(1);
  });

  it.each([3, 4, 5, 6, 7])('accepts legacy v%i with omitted optional stores through normalization', async version => {
    const input = legacy(version);
    delete (input.data as any).chatSessions;
    await backupService.restoreData(input);
    expect((await db.projects.get(2))!.name).toBe('Cadangan');
    expect(await db.chatSessions.count()).toBe(0);
  });

  const invalid: [string, (b: any) => void][] = [
    ['scope project', b => b.scope = 'project'],
    ['scope unknown', b => b.scope = 'unexpected'],
    ['future version', b => b.version = 9],
    ['old version', b => b.version = 2],
    ['fractional version', b => b.version = 3.5],
    ['malformed project', b => b.data.projects = [{ id: 2 }]],
    ['wrong field type', b => b.data.chapters[0].content = {}],
    ['missing parent', b => b.data.chapters[0].projectId = 999],
    ['duplicate ids', b => b.data.chapters.push({ ...b.data.chapters[0] })],
    ['invalid optional table', b => b.data.maps = {}],
    ['unknown table', b => b.data.unrecognized = []],
    ['inherited schema name', b => b.data.toString = []],
    ['invalid nested data', b => b.data.projects[0].calendar = { months: 'wrong' }],
    ['invalid snapshot chapter ID', b => b.data.snapshots = [{ id: 1, chapterId: 0, content: '', label: '', timestamp: 1 }]],
    ['nonfinite number', b => b.data.chapters[0].lastModified = NaN],
    ['malformed checksum', b => b.checksum = 'abc'],
    ['checksum mismatch', b => b.checksum = '0'.repeat(64)],
    ['duplicate bible key', b => b.data.bible = [1, 2].map(id => ({ id, projectId: 2, key: 'Tone', instruction: '' }))],
    ['v8 missing stores', b => { b.version = 8; b.imageMode = 'full'; }],
    ['excess records', b => b.data.codex = Array.from({ length: BACKUP_LIMITS.recordsPerTable + 1 }, () => null)],
  ];
  it.each(invalid)('rejects %s without clear or pre-restore writes', async (_, change) => {
    const input = legacy(); change(input);
    const clear = vi.spyOn(db.projects, 'clear');
    await expect(backupService.restoreData(input)).rejects.toThrow();
    expect(clear).not.toHaveBeenCalled();
    expect(await db.backups.count()).toBe(0);
    expect((await db.chapters.get(1))!.content).toBe('<p>draft aktif</p>');
  });

  it('rejects cross-project relations', async () => {
    const b = legacy();
    b.data.projects.push({ id: 3, name: 'Lain', description: '', createdAt: 1, lastOpened: 1 });
    b.data.codex = [{ id: 3, projectId: 3, name: 'Lain', category: 'character', aliases: [], tags: [], description: '' }];
    b.data.timeline = [{ id: 2, projectId: 2, title: '', description: '', order: 0, type: 'plot', characterIds: [3] }];
    await expect(backupService.restoreData(b)).rejects.toThrow(/referensi/);
    expect(await db.backups.count()).toBe(0);
  });

  it('fails closed if the safety snapshot cannot be persisted', async () => {
    vi.spyOn(backupService, 'saveToInternalDB').mockRejectedValue(new Error('quota'));
    const clear = vi.spyOn(db.projects, 'clear');
    await expect(backupService.restoreData(legacy())).rejects.toThrow(/cadangan pengaman/);
    expect(clear).not.toHaveBeenCalled();
    expect((await db.projects.get(1))!.name).toBe('Aktif');
  });

  it('keeps the original checksum valid when legacy tables are normalized', async () => {
    const input = legacy(4);
    delete (input.data as any).chatSessions;
    input.checksum = await backupService.computeChecksum(JSON.stringify(input.data));
    const verified = await backupService.validateInput(input, 'all');
    await backupService.restoreData(verified);
    expect((await db.projects.get(2))!.name).toBe('Cadangan');
    expect((input.data as any).chatSessions).toBeUndefined();
  });

  it('rolls back every store on an insert failure and retains the safety snapshot', async () => {
    vi.spyOn(db.chapters, 'bulkAdd').mockRejectedValueOnce(new Error('write failure'));
    await expect(backupService.restoreData(legacy())).rejects.toThrow(/write failure/);
    expect((await db.projects.get(1))!.name).toBe('Aktif');
    expect((await db.chapters.get(1))!.content).toBe('<p>draft aktif</p>');
    expect((await db.maps.get(1))!.imageBlob).toBeInstanceOf(Blob);
    expect(await latest('pre-restore')).toBeDefined();
  });

  it('validates import through the same schema and remaps valid complete images', async () => {
    const input = legacy(); input.scope = 'project';
    input.data.maps = [{ id: 2, projectId: 2, name: 'Peta', width: 100, height: 100, createdAt: 1, imageDataUrl: image }];
    const bad = structuredClone(input); bad.data.chapters[0].projectId = 99;
    await expect(backupService.importProjectData(bad)).rejects.toThrow(/referensi/);
    expect(await db.projects.count()).toBe(1);
    const { projectId } = await backupService.importProjectData(input);
    expect(projectId).not.toBe(1);
    expect((await db.maps.where('projectId').equals(projectId).first())!.imageBlob).toBeInstanceOf(Blob);
    expect((await db.projects.get(1))!.name).toBe('Aktif');
  });
});

describe('bounded decoding and raster-only images', () => {
  it.each(['https://example.test/image.png', 'data:image/svg+xml;base64,PHN2Zz4=', 'data:text/html;base64,PGgxPg==', 'data:image/png;base64,%%%'])('rejects %s without fetch', async url => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('synthetic-image'));
    await expect(dataUrlToBlob(url)).rejects.toThrow();
    const input = legacy();
    input.data.maps = [{ id: 2, projectId: 2, name: 'Peta', width: 100, height: 100, createdAt: 1, imageDataUrl: url }];
    await expect(backupService.restoreData(input)).rejects.toThrow();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(await db.backups.count()).toBe(0);
  });

  it('rejects oversized input before reading bytes and cancels oversized streams', async () => {
    const arrayBuffer = vi.fn();
    await expect(readBackupFile({ size: BACKUP_LIMITS.fileBytes + 1, arrayBuffer } as unknown as Blob)).rejects.toThrow(/64 MiB/);
    expect(arrayBuffer).not.toHaveBeenCalled();
    const cancel = vi.fn();
    const stream = new ReadableStream({ start(c) { c.enqueue(new Uint8Array(11)); }, cancel });
    await expect(readBoundedStream(stream, 10)).rejects.toThrow(/batas/);
    expect(cancel).toHaveBeenCalled();
  });

  it('decodes raw and gzip files by magic bytes, including internal and Drive readers', async () => {
    const json = JSON.stringify(legacy());
    const raw = new Blob([json]);
    const gzip = await new Response(raw.stream().pipeThrough(new CompressionStream('gzip'))).blob();
    expect(await readBackupFile(raw)).toEqual(legacy());
    expect(await readBackupFile(gzip)).toEqual(legacy());
    expect(await readBackupResponse(new Response(gzip))).toEqual(legacy());
    expect(await backupService.decodeInternalBackup({ timestamp: 1, size: gzip.size, data: new Uint8Array(await gzip.arrayBuffer()) })).toBe(json);
  });

  it('stops a gzip expansion exceeding the JSON budget and rejects corrupt gzip', async () => {
    const gzip = await new Response(new Blob(['x'.repeat(2048)]).stream().pipeThrough(new CompressionStream('gzip'))).blob();
    const original = BACKUP_LIMITS.jsonBytes;
    try {
      Object.defineProperty(BACKUP_LIMITS, 'jsonBytes', { value: 1024, configurable: true });
      await expect(readBackupFile(gzip)).rejects.toThrow(/batas/);
    } finally {
      Object.defineProperty(BACKUP_LIMITS, 'jsonBytes', { value: original, configurable: true });
    }
    await expect(readBackupFile(new Blob([new Uint8Array([0x1f, 0x8b, 0x01])]))).rejects.toThrow();
  });

  it('retains full pre-restore snapshots while rotating automatic history', async () => {
    const full = await backupService.collectAllData();
    full.timestamp = 1;
    await backupService.saveToInternalDB(full, 'pre-restore');
    for (let index = 0; index < 9; index++) {
      await backupService.saveToInternalDB({ ...full, timestamp: 1000 + index });
    }
    const records = await db.backups.toArray();
    expect(records.filter(row => row.kind === 'auto')).toHaveLength(5);
    const safety = records.find(row => row.kind === 'pre-restore');
    expect(safety).toBeDefined();
    if (!safety) throw new Error('Missing safety backup');
    const parsed = JSON.parse(await backupService.decodeInternalBackup(safety));
    expect(parsed.imageMode).toBe('full');
    expect(parsed.data.maps[0].imageDataUrl).toBe(image);
  });

  it('rejects oversized raster payloads before allocating decoded bytes', async () => {
    const original = BACKUP_LIMITS.imageBytes;
    try {
      Object.defineProperty(BACKUP_LIMITS, 'imageBytes', { value: 7, configurable: true });
      await expect(dataUrlToBlob(image)).rejects.toThrow(/5 MiB/);
    } finally {
      Object.defineProperty(BACKUP_LIMITS, 'imageBytes', { value: original, configurable: true });
    }
  });
});
