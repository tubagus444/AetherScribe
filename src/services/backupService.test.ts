import 'fake-indexeddb/auto';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@/src/db';
import { backupService, type BackupData } from './backupService';
import { BACKUP_LIMITS } from '@/src/lib/backupLimits';
import { readBackupFile, readBackupResponse, readBoundedStream } from '@/src/lib/backupIO';
import { dataUrlToBlob } from '@/src/lib/blobCodec';

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
    ['orphan snapshot', b => b.data.snapshots = [{ id: 1, chapterId: 999, content: '', label: '', timestamp: 1 }]],
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
