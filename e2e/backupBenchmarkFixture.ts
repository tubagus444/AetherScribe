import { db } from '../src/db';
import { backupService, type BackupData } from '../src/services/backupService';
import { readBackupFile } from '../src/lib/backupIO';

export interface Scenario { chapters: number; words: number; images: number }
let retained: BackupData | null = null;
export function release() { retained = null; }
export async function seed(scenario: Scenario) {
  for (const table of db.tables) await table.clear();
  await db.projects.add({ id: 1, name: 'L06 Synthetic', description: '', createdAt: 1, lastOpened: 1 });
  let random = 123456;
  const next = () => { random = (Math.imul(random, 1664525) + 1013904223) >>> 0; return random; };
  await db.chapters.bulkAdd(Array.from({ length: scenario.chapters }, (_, index) => ({
    id: index + 1, projectId: 1, title: `Chapter ${index}`, order: index, lastModified: 1,
    content: `<p>${Array.from({ length: scenario.words }, () => `lex${(next() >>> 12) % 1024}`).join(' ')}</p>`,
  })));
  let imageBytes = 0;
  for (let id = 1; id <= scenario.images; id++) {
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 600;
    const context = canvas.getContext('2d'); if (!context) throw new Error('Canvas unavailable');
    const data = context.createImageData(600, 600);
    for (let i = 0; i < data.data.length; i += 4) {
      const value = next(); data.data[i] = value >>> 24; data.data[i + 1] = value >>> 16; data.data[i + 2] = value >>> 8; data.data[i + 3] = 255;
    }
    context.putImageData(data, 0, 0);
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error('PNG failed')), 'image/png'));
    imageBytes += blob.size;
    await db.maps.add({ id, projectId: 1, name: `Map ${id}`, width: 600, height: 600, createdAt: 1, imageBlob: blob });
  }
  return { imageBytes };
}

async function timed<T>(operation: () => T | Promise<T>) {
  const gaps: number[] = []; let previous = performance.now();
  const timer = setInterval(() => { const now = performance.now(); gaps.push(Math.max(0, now - previous - 16)); previous = now; }, 16);
  await new Promise(resolve => setTimeout(resolve, 25));
  const start = performance.now();
  try {
    const result = await operation(); const elapsedMs = performance.now() - start;
    await new Promise(resolve => setTimeout(resolve, 25));
    return { result, elapsedMs, maxTimerDelayMs: Math.max(0, ...gaps), delayedTicksOver50Ms: gaps.filter(gap => gap > 50).length };
  } finally { clearInterval(timer); }
}

export async function measure() {
  const collect = await timed(() => backupService.collectAllData());
  retained = collect.result;
  const file = await timed(() => JSON.stringify(collect.result));
  const gzip = await timed(() => backupService.compressData(file.result));
  const auto = await timed(() => backupService.saveToInternalDB(collect.result, 'auto'));
  const stored = await db.backups.orderBy('timestamp').last();
  if (!stored) throw new Error('Auto backup missing');
  const metric = ({ elapsedMs, maxTimerDelayMs, delayedTicksOver50Ms }: { elapsedMs: number; maxTimerDelayMs: number; delayedTicksOver50Ms: number }) => ({ elapsedMs, maxTimerDelayMs, delayedTicksOver50Ms });
  return { collect: metric(collect), fileJson: metric(file), gzip: metric(gzip), autoSaveAfterCollect: metric(auto), jsonBytes: new Blob([file.result]).size, gzipBytes: gzip.result.blob.size, gzipUsed: gzip.result.compressed, autoBytes: stored.size };
}

export async function verify() {
  if (!retained) throw new Error('No backup');
  const expected = retained;
  if (!expected.checksum || expected.checksum.length !== 64) throw new Error('SHA-256 checksum unavailable');
  const { blob } = await backupService.compressData(JSON.stringify(expected));
  const parsed = await readBackupFile(blob);
  await backupService.validateInput(parsed, 'all');
  const chapters = await db.chapters.toArray();
  const maps = await db.maps.toArray();
  await db.chapters.update(1, { content: '<p>Changed for restore check</p>' });
  await backupService.restoreData(parsed);
  const restored = await db.chapters.toArray();
  if (JSON.stringify(restored) !== JSON.stringify(chapters)) throw new Error('Chapter round-trip mismatch');
  const restoredMaps = await db.maps.toArray();
  for (const map of maps) {
    const copy = restoredMaps.find(row => row.id === map.id);
    if (!map.imageBlob || !copy?.imageBlob) throw new Error('Image missing');
    const a = new Uint8Array(await map.imageBlob.arrayBuffer()), b = new Uint8Array(await copy.imageBlob.arrayBuffer());
    if (a.length !== b.length || a.some((value, index) => value !== b[index])) throw new Error('Image mismatch');
  }
  if (maps.length !== restoredMaps.length) throw new Error('Map count mismatch');
  const autos = (await db.backups.toArray()).filter(row => row.kind === 'auto');
  if (!autos.length) throw new Error('Auto backup missing after restore');
  const autoId = autos[0].id; if (autoId === undefined) throw new Error('Missing backup ID');
  await backupService.restoreFromBackup(autoId);
  if (JSON.stringify(await db.chapters.toArray()) !== JSON.stringify(chapters)) throw new Error('Internal restore mismatch');
  for (const map of maps) {
    const copy = await db.maps.get(map.id);
    if (!map.imageBlob || !copy?.imageBlob) throw new Error('Internal image missing');
    const a = new Uint8Array(await map.imageBlob.arrayBuffer()), b = new Uint8Array(await copy.imageBlob.arrayBuffer());
    if (a.length !== b.length || a.some((value, index) => value !== b[index])) throw new Error('Internal image mismatch');
  }
  retained = null;
  return { checksum: true, fullRestore: true, internalRestore: true, chapters: restored.length, images: restoredMaps.length };
}
