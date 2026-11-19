import Dexie from 'dexie';
import { db } from '../src/db';
import { readChapterList, readLatestChapterModified } from '../src/services/chapterQueries';
import { visitSceneEmbeddings } from '../src/services/sceneQueries';
import { StableTopK } from '../src/lib/stableTopK';
import { countWords } from '../src/lib/utils';

let retained: unknown;
export async function seed(chapters: number, words: number) {
  await db.projects.put({ id: 1, name: 'F23 Synthetic', description: '', createdAt: 1, lastOpened: 1 });
  await db.chapters.clear();
  await db.sceneEmbeddings.clear();
  await db.chapters.bulkAdd(Array.from({ length: chapters }, (_, index) => ({
    id: index + 1, projectId: 1, title: `Fixture ${index}`, content: `<p>${'kata '.repeat(words)}</p>`, order: index, lastModified: index + 1,
  })));
}
export async function baselineList(hold = false) {
  const rows = await db.chapters.where('projectId').equals(1).toArray();
  if (hold) retained = rows;
  return rows.sort((a, b) => a.order - b.order || a.id! - b.id!).map(row => ({
    id: row.id, projectId: row.projectId, title: row.title, order: row.order, status: row.status || 'outline', lastModified: row.lastModified, _computedWordCount: countWords(row.content),
  }));
}
export async function indexedList(hold = false) { const rows = await readChapterList(1); if (hold) retained = rows; return rows; }
export async function baselineLatest() { return Math.max(0, ...(await db.chapters.where('projectId').equals(1).toArray()).map(row => row.lastModified)); }
export async function indexedLatest() { return readLatestChapterModified(1); }
export function release() { retained = undefined; }
// Accessing the retained object also prevents an optimizer from dropping the heap probe.
export function retainedCount() { return (retained as unknown[] | undefined)?.length ?? 0; }

export async function migrateV33() {
  await db.delete();
  const stores = Object.fromEntries(db.tables.map(table => [table.name,
    table.name === 'chapters' ? '++id, projectId, order' : table.name === 'sceneEmbeddings' ? 'id, projectId, chapterId, [projectId+chapterId]' : [table.schema.primKey.src, ...table.schema.indexes.map(index => index.src)].join(', '),
  ]));
  const old = new Dexie(db.name); old.version(33).stores(stores);
  await old.table('projects').add({ id: 1, name: 'Legacy', description: '', createdAt: 1, lastOpened: 1 });
  await old.table('chapters').add({ id: 7, projectId: 1, title: 'Legacy', content: '<p>legacy native browser</p>', order: 0, lastModified: 9 }); old.close();
  await db.open();
  return { version: db.verno, rows: await readChapterList(1), chapter: await db.chapters.get(7) };
}

export async function seedScenes(size: number, chapterCount = size) {
  await db.sceneEmbeddings.clear();
  await db.sceneEmbeddings.bulkAdd(Array.from({ length: size }, (_, index) => ({
    id: String(index).padStart(8, '0'), projectId: 1, chapterId: index % chapterCount + 1, chunkIndex: Math.floor(index / chapterCount),
    snippet: 'fixture', contentHash: 'fixture', lastUpdated: 1, embedding: Float32Array.from({ length: 384 }, (_, j) => j === 0 ? (index % 31) / 31 : 0),
  })));
}
function sceneScore(row: { embedding: Float32Array }) {
  let score = 0;
  for (let index = 0; index < 384; index++) score += row.embedding[index] * (index === 0 ? 1 : 0);
  return score;
}
export async function baselineScenes(hold = false) {
  const rows = await db.sceneEmbeddings.where('projectId').equals(1).toArray();
  if (hold) retained = rows;
  return rows.map(row => ({ chapterId: row.chapterId, score: sceneScore(row) })).sort((a, b) => b.score - a.score).slice(0, 5);
}
export async function indexedScenes() {
  const best = new StableTopK<{ chapterId: number; score: number }>(5);
  await visitSceneEmbeddings(1, row => { const hit = { chapterId: row.chapterId, score: sceneScore(row) }; best.add(hit, hit.score); });
  return best.results();
}
