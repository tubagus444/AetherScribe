import { create, insert, search, Orama, remove } from '@orama/orama';
import { CodexEntry } from '@/src/types';
import { db } from '@/src/db';

const ORAMA_SCHEMA = {
  dexieId: 'number',
  name: 'string',
  aliases: 'string[]',
  category: 'string',
  description: 'string',
  tags: 'string[]',
} as const;

export class OramaStore {
  private db: Orama<any> | null = null;
  private currentProjectId: number | null = null;
  private idMap: Map<number, string> = new Map(); // Map Dexie ID to Orama Document ID
  // Token generasi init: setiap init menaikkannya; init lama membatalkan diri bila
  // di-supersede (mis. ganti proyek cepat) agar tak menulis ke indeks yang salah.
  private initGen = 0;

  async init(projectId: number) {
    if (this.currentProjectId === projectId && this.db) {
      return; // Already initialized
    }

    const gen = ++this.initGen;

    // BUILD-then-SWAP: bangun indeks baru di variabel LOKAL, lalu pasang atomik. Sampai
    // swap, `this.db`/`this.currentProjectId` tetap milik proyek lama → hook Dexie yang
    // menembak selama init TIDAK menyisip ke indeks setengah-jadi (dulu = dokumen
    // duplikat + `idMap` hantu yang tak bisa dihapus sampai re-init).
    const newDb = await create({ schema: ORAMA_SCHEMA });
    if (gen !== this.initGen) return; // di-supersede init proyek lain

    const newIdMap = new Map<number, string>();
    const entries = await db.codex.where('projectId').equals(projectId).toArray();
    if (gen !== this.initGen) return;

    for (const entry of entries) {
      if (!entry.id) continue;
      try {
        const oramaId = await insert(newDb, {
          dexieId: entry.id,
          name: entry.name,
          aliases: entry.aliases || [],
          category: entry.category,
          description: entry.description || '',
          tags: entry.tags || [],
        });
        newIdMap.set(entry.id, oramaId);
      } catch (e) {
        console.error('Failed to index codex entry in Orama', e);
      }
    }
    if (gen !== this.initGen) return; // cek terakhir sebelum swap

    this.db = newDb;
    this.idMap = newIdMap;
    this.currentProjectId = projectId;
    console.log(`[RAG] Orama initialized with ${entries.length} entries for project ${projectId}.`);
  }

  async indexEntry(entry: CodexEntry) {
    if (!this.db || !entry.id) return;
    // Guard lintas-proyek: hook Dexie `creating`/`updating` global menembak untuk SEMUA
    // tulis codex — termasuk bulk-write impor/restore proyek LAIN. Tanpa guard ini,
    // entri proyek lain ikut masuk indeks proyek aktif → hasil pencarian tercemar
    // sampai re-init. Hanya indeks entri milik proyek yang sedang aktif.
    if (this.currentProjectId != null && entry.projectId !== this.currentProjectId) return;
    try {
      await this.removeEntry(entry.id);
      const oramaId = await insert(this.db, {
        dexieId: entry.id,
        name: entry.name,
        aliases: entry.aliases || [],
        category: entry.category,
        description: entry.description || '',
        tags: entry.tags || [],
      });
      this.idMap.set(entry.id, oramaId);
    } catch (e) {
      console.error('Failed to index codex entry in Orama', e);
    }
  }

  async updateEntry(entry: CodexEntry) {
    if (!entry.id) return;
    await this.removeEntry(entry.id);
    await this.indexEntry(entry);
  }

  async removeEntry(dexieId: number) {
    if (!this.db) return;
    const oramaId = this.idMap.get(dexieId);
    if (oramaId) {
      try {
        await remove(this.db, oramaId);
        this.idMap.delete(dexieId);
      } catch (e) {
        console.error('Failed to remove entry from Orama', e);
      }
    }
  }

  async search(query: string, limit: number = 5): Promise<CodexEntry[]> {
    const hits = await this.searchWithScores(query, limit);
    return hits.map(h => h.entry);
  }

  async searchWithScores(query: string, limit: number = 5): Promise<{entry: CodexEntry; score: number}[]> {
    if (!this.db || !query.trim()) return [];

    try {
      const results = await search(this.db, {
        term: query,
        properties: ['name', 'aliases', 'category', 'description', 'tags'],
        limit,
      });

      const validHits = results.hits.filter(hit => hit.document.dexieId !== undefined);
      if (validHits.length === 0) return [];

      const ids = validHits.map(hit => hit.document.dexieId as number);
      
      // Fetch full records from Dexie to get complete up-to-date data
      const entries = await db.codex.where('id').anyOf(ids).toArray();
      
      // Keep search relevance order & attach score
      const entryMap = new Map(entries.map(e => [e.id, e]));
      return validHits
        .map(hit => ({
          entry: entryMap.get(hit.document.dexieId as number)!,
          score: hit.score,
        }))
        .filter(h => h.entry !== undefined && h.entry.projectId === this.currentProjectId);
    } catch (e) {
      console.error('Orama searchWithScores failed', e);
      throw e;
    }
  }
}

export const oramaStore = new OramaStore();
