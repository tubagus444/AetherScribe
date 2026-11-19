import { db } from '../src/db';
import { backupService, type BackupData } from '../src/services/backupService';
import { readChapterList } from '../src/services/chapterQueries';
import { saveChapterContent } from '../src/services/chapterOperations';
import { dexieChapterStorage } from '../src/adapters/dexieChapterStorage';
import { findWorkshopSession } from '../src/services/chatSessionOperations';
import { indexedScenes, seed, seedScenes } from './dataPathsFixture';

export interface CapacityScenario {
  chapters: number;
  words: number;
  scenes: number;
  sessions: number;
  messages: number;
  snapshots: number;
  maps: number;
}

const image = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j3ioAAAAASUVORK5CYII=';
let collected: BackupData;
let input: unknown;
let text: string;

export async function seedCapacity(scenario: CapacityScenario) {
  for (const table of db.tables) await table.clear();
  await seed(scenario.chapters, scenario.words);
  await seedScenes(scenario.scenes, scenario.chapters);
  const contents = (await db.chapters.get(1))!.content;
  await db.snapshots.bulkAdd(Array.from({ length: scenario.snapshots }, (_, index) => ({
    id: index + 1, chapterId: 1, timestamp: index, label: `Versi ${index}`,
    content: `<p>Versi ${index}</p>${contents}`,
  })));
  const paragraph = 'Rencana bagian cerita dengan referensi untuk sesi Workshop. '.repeat(8);
  await db.chatSessions.bulkAdd(Array.from({ length: scenario.sessions }, (_, index) => ({
    id: index + 1, projectId: 1, kind: 'workshop' as const, workshopKey: `new:seed-${index}`,
    title: `Sesi ${index}`, lastMessageAt: index, activeChapterId: 1,
    messages: Array.from({ length: scenario.messages }, (_, message) => ({
      role: message % 2 ? 'model' as const : 'user' as const,
      content: `${paragraph} Sesi ${index} / pesan ${message}.`, timestamp: message,
    })),
  })));
  const imageBlob = new Blob([Uint8Array.from(atob(image), value => value.charCodeAt(0))], { type: 'image/png' });
  await db.maps.bulkAdd(Array.from({ length: scenario.maps }, (_, index) => ({
    id: index + 1, projectId: 1, name: `Atlas ${index}`, width: 1, height: 1, createdAt: index, imageBlob,
  })));
  await db.mapMarkers.bulkAdd(Array.from({ length: scenario.maps }, (_, index) => ({
    id: index + 1, projectId: 1, mapId: index + 1, kind: 'pin' as const, geometry: { x: .25, y: .75 }, createdAt: index,
  })));
  return {
    imageBytes: imageBlob.size * scenario.maps,
    storage: await navigator.storage.estimate(),
  };
}

export async function prepareCapacity() {
  collected = await backupService.collectAllData();
  text = backupService.serializeExternalBackup(collected, 2);
  input = JSON.parse(text);
  return new Blob([text]).size;
}

export async function measureCapacity(scenario: CapacityScenario) {
  const time = async <T>(work: () => Promise<T> | T) => {
    const start = performance.now();
    await work();
    return performance.now() - start;
  };
  const content = (await db.chapters.get(1))!.content;
  const save = await time(() => saveChapterContent(1, `<p>Sunting</p>${content}`, content));
  const list = await time(() => readChapterList(1));
  const search = await time(indexedScenes);
  const chat = await time(() => findWorkshopSession(1, `new:seed-${scenario.sessions - 1}`));
  const snapshots = await time(() => dexieChapterStorage.read.readChapterSnapshots(1));
  const collect = await time(() => backupService.collectAllData());
  const serialize = await time(() => backupService.serializeExternalBackup(collected, 2));
  const verify = await time(() => backupService.validateInput(input, 'all'));
  const restore = await time(() => backupService.restoreData(input));
  // Restore clears the derived index, so rebuild the same fixture outside timing.
  await seedScenes(scenario.scenes, scenario.chapters);
  return { save, list, search, chat, snapshots, collect, serialize, verify, restore };
}

export async function verifyCapacity(scenario: CapacityScenario) {
  const restored = await backupService.collectAllData();
  if (JSON.stringify(restored.data) !== JSON.stringify(collected.data) || restored.checksum !== collected.checksum) {
    throw new Error('Data, references, or assets changed after restore');
  }
  if ((await findWorkshopSession(1, `new:seed-${scenario.sessions - 1}`))?.messages.length !== scenario.messages) {
    throw new Error('Workshop history changed after restore');
  }
  return (await db.backups.count()) > 0;
}

export function runCapacityProbe(operation: 'serialize' | 'verify' | 'restore') {
  if (operation === 'serialize') return backupService.serializeExternalBackup(collected, 2).length;
  if (operation === 'verify') return backupService.validateInput(input, 'all').then(verified => verified.data.chapters.length);
  return backupService.restoreData(input);
}
