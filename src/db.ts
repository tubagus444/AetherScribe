/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import Dexie, { Table } from 'dexie';
import { Chapter, Project, CodexEntry, StoryBibleRule, AIAction, Snapshot, TimelineEvent, Relationship, AppError, BackupRecord, ChatSession, VectorEmbedding, AIUsageLog, CustomCategory, SceneEmbedding, PlotPromise, GlossaryEntry, AtlasMap, MapMarker, ContinuityTriage } from '@/src/types';
import { flushActiveEditor } from '@/src/features/editor/editorBridge';

export class AetherScribeDB extends Dexie {
  projects!: Table<Project>;
  chapters!: Table<Chapter>;
  codex!: Table<CodexEntry>;
  bible!: Table<StoryBibleRule>;
  aiActions!: Table<AIAction>;
  snapshots!: Table<Snapshot>;
  timeline!: Table<TimelineEvent>;
  relationships!: Table<Relationship>;
  errors!: Table<AppError>;
  backups!: Table<BackupRecord>;
  chatSessions!: Table<ChatSession>;
  embeddings!: Table<VectorEmbedding>;
  aiUsageLogs!: Table<AIUsageLog>;
  codexCategories!: Table<CustomCategory>;
  sceneEmbeddings!: Table<SceneEmbedding>;
  plotPromises!: Table<PlotPromise>;
  glossary!: Table<GlossaryEntry>;
  maps!: Table<AtlasMap>;
  mapMarkers!: Table<MapMarker>;
  continuityTriage!: Table<ContinuityTriage>;

  constructor() {
    super('AetherScribeDB');
    // Baseline sengaja dimulai di v10 (definisi <v10 sudah dihapus). Untuk fresh
    // install, Dexie membangun bertahap v10→v17 sehingga seluruh tabel terbentuk
    // mulai v11. v10 dipertahankan karena memiliki .upgrade() (dedup bible).
    this.version(10).stores({
      bible: '++id, projectId, key'
    }).upgrade(async (tx) => {
      // Cleanup duplicate bible entries before applying unique index in next version
      const bibleEntries = await tx.table('bible').toArray();
      const seen = new Set<string>();
      const idsToDelete: any[] = [];

      for (const entry of bibleEntries) {
        const compositeKey = `${entry.projectId}|${entry.key}`;
        if (seen.has(compositeKey)) {
          idsToDelete.push(entry.id);
        } else {
          seen.add(compositeKey);
        }
      }

      if (idsToDelete.length > 0) {
        await tx.table('bible').bulkDelete(idsToDelete);
        console.log(`Cleaned up ${idsToDelete.length} duplicate bible entries during migration.`);
      }
    });
    // ─── Konstanta stores berjenjang ───────────────────────────────────────
    // Setiap konstanta menambah tabel/indeks baru di atas pendahulunya.
    // Dipakai oleh blok version() di bawah agar definisi tak diulang 22×.
    // JANGAN hapus blok version lama — Dexie membutuhkan rantai lengkap
    // untuk pengguna yang meng-upgrade dari versi mana pun.

    const CORE_STORES = {
      projects: '++id, name, lastOpened',
      chapters: '++id, projectId, order',
      codex: '++id, projectId, name, category, *aliases',
      bible: '++id, projectId, key, &[projectId+key]',
      aiActions: '++id, projectId, label',
      snapshots: '++id, chapterId, timestamp',
      timeline: '++id, chapterId, projectId, type',
      relationships: '++id, projectId, sourceId, targetId',
      errors: '++id, timestamp, type',
    };

    // v14: indeks chatSessions stabil sejak sini (projectId+chapterId+activeChapterId+lastMessageAt).
    const STORES_V14 = {
      ...CORE_STORES,
      backups: '++id, timestamp',
      chatSessions: '++id, projectId, chapterId, activeChapterId, lastMessageAt',
    };

    // v16: +embeddings
    const STORES_V16 = { ...STORES_V14, embeddings: 'id, projectId, codexId' };

    // v17: +aiUsageLogs
    const STORES_V17 = { ...STORES_V16, aiUsageLogs: '++id, timestamp, provider, actionType' };

    // v19: +codexCategories
    const STORES_V19 = { ...STORES_V17, codexCategories: '++id, projectId, slug, &[projectId+slug]' };

    // v20: +sceneEmbeddings
    const STORES_V20 = { ...STORES_V19, sceneEmbeddings: 'id, projectId, chapterId, [projectId+chapterId]' };

    // v21: +plotPromises
    const STORES_V21 = { ...STORES_V20, plotPromises: '++id, projectId, codexId' };

    // v25: +glossary
    const STORES_V25 = { ...STORES_V21, glossary: '++id, projectId' };

    // v32: +maps, +mapMarkers (Atlas Dunia)
    const STORES_V32 = {
      ...STORES_V25,
      maps: '++id, projectId',
      mapMarkers: '++id, projectId, mapId, codexId',
    };

    // v33: +continuityTriage
    const STORES_V33 = {
      ...STORES_V32,
      continuityTriage: '++id, projectId, findingId'
    };

    // ─── Rantai versi ─────────────────────────────────────────────────────

    this.version(11).stores({
      ...CORE_STORES,
      chatSessions: '++id, projectId, lastMessageAt',
    });

    this.version(12).stores({
      ...CORE_STORES,
      backups: '++id, timestamp',
      chatSessions: '++id, projectId, lastMessageAt',
    });

    this.version(13).stores({
      ...CORE_STORES,
      backups: '++id, timestamp',
      chatSessions: '++id, projectId, chapterId, lastMessageAt',
    });

    // Catatan: v15 identik dengan v14 (no-op version bump historis). JANGAN dihapus —
    // menghapus versi tengah dapat memicu jalur upgrade ulang bagi DB yang sudah di v15+.
    this.version(14).stores(STORES_V14);
    this.version(15).stores(STORES_V14);

    this.version(16).stores(STORES_V16);

    // v18: skema identik dengan v17 (field `kind` tidak diindeks). Upgrade hanya
    // backfill: men-tag sesi Scribble lama yang dibuat sebelum field `kind` ada,
    // agar tidak lagi mencemari daftar riwayat Studio. Diskriminasi via pola judul
    // auto-generate Scribble ("Global Scribble" / "Chapter N Scribble") — sesi
    // Studio bertajuk prompt pengguna / "Percakapan Baru".
    this.version(17).stores(STORES_V17);
    this.version(18).stores(STORES_V17).upgrade(async (tx) => {
      const sessions = await tx.table('chatSessions').toArray();
      let scribbleCount = 0;
      await Promise.all(sessions.map((s: ChatSession) => {
        if (s.kind) return Promise.resolve(); // sesi baru sudah ter-tag
        const isScribble = /Scribble$/.test(s.title);
        if (isScribble) scribbleCount++;
        return tx.table('chatSessions').update(s.id, { kind: isScribble ? 'scribble' : 'studio' });
      }));
      if (scribbleCount > 0) {
        console.log(`Tagged ${scribbleCount} legacy Scribble session(s) as kind:'scribble'.`);
      }
    });

    // v19: tabel baru `codexCategories` untuk kategori Codex kustom per-proyek.
    // Append-only; tidak ada migrasi data (entri lama tetap memakai slug bawaan).
    this.version(19).stores(STORES_V19);

    // v20: tabel baru `sceneEmbeddings` untuk Pencarian Semantik naskah (cari adegan
    // per makna). Append-only; tidak ada migrasi data (indeks dibangun on-demand di
    // panel, inkremental via contentHash per chunk).
    this.version(20).stores(STORES_V20);

    // v21: tabel baru `plotPromises` untuk Pelacak Janji Plot (Chekhov's Gun).
    // Append-only; tidak ada migrasi data. Status turunan (tertidur/aktif) dihitung
    // on-demand di panel via PresenceIndex — tak disimpan.
    this.version(21).stores(STORES_V21);

    // v22: field baru `hidden`/`secret` di CodexEntry untuk Lapis "Kebenaran
    // Tersembunyi" (kanon vs rahasia penulis). Keduanya opsional & TIDAK diindeks →
    // skema identik dengan v21, append-only, tanpa migrasi data.
    this.version(22).stores(STORES_V21);

    // v23: field baru `payoffCodexId` di PlotPromise (Janji Plot → payoff/reveal, #2).
    // Tautan agregasi ke entri Codex yang dibayar — TIDAK diindeks → skema identik v22.
    this.version(23).stores(STORES_V21);

    // v24: field baru `namePalette` di CodexEntry (Bengkel Nama, #3). JSON inert
    // (BUKAN FK, tak diindeks) → skema identik dengan v23, append-only, tanpa migrasi.
    this.version(24).stores(STORES_V21);

    // v25: tabel baru `glossary` untuk Glosarium istilah in-world (#8). Project-scoped
    // (FK projectId saja). Append-only; tak ada migrasi data.
    this.version(25).stores(STORES_V25);

    // v26: field baru `fields` di CustomCategory (template field, #17) & `customFields`
    // di CodexEntry (nilainya). Keduanya inert → skema identik dengan v25.
    this.version(26).stores(STORES_V25);

    // v27: field baru `worldStatus`/`todo` di CodexEntry (Pelacak kelengkapan, #11).
    // Keduanya inert → skema identik dengan v26.
    this.version(27).stores(STORES_V25);

    // v28: field baru `tension` di Chapter (Heatmap tensi/pacing, #16). Inert →
    // skema identik dengan v27.
    this.version(28).stores(STORES_V25);

    // v29: field baru `factionTag` di CodexEntry (Panel Faksi & Kelompok, #15). Inert →
    // skema identik dengan v28.
    this.version(29).stores(STORES_V25);

    // v30: field baru `factionBoard` di CodexEntry (Papan Faksi kanvas, #15 fase 2).
    // Inert → skema identik dengan v29.
    this.version(30).stores(STORES_V25);

    // v31: Kalender Dunia (#4). Field baru `Project.calendar` (JSON inert) +
    // `TimelineEvent.startDate`/`endDate` (WorldDate inert). Semua tak diindeks →
    // skema identik dengan v30.
    this.version(31).stores(STORES_V25);

    // v32: Atlas Dunia (peta interaktif). Dua tabel project-scoped BARU (bukan
    // field inert) — jadi WAJIB sinkron di importRemap.ts / deleteProject /
    // backupService (lihat RENCANA-ATLAS-DUNIA.md §3). `maps` menyimpan Blob gambar;
    // `mapMarkers` menyimpan geometri 0–1 + `codexId` opsional (faksi = turunan
    // codexId ber-factionTag, tanpa FK faksi terpisah). Append-only, tanpa migrasi
    // data (tabel baru kosong).
    this.version(32).stores(STORES_V32);

    // v33: Triase temuan Peta Kontinuitas. Append-only, tanpa migrasi data.
    this.version(33).stores(STORES_V33);
  }
}

export const db = new AetherScribeDB();

// --- Ketahanan koneksi DB (multi-tab & upgrade) ---
// db.ts dimuat juga di context worker & orama worker → ada koneksi IndexedDB ganda.
// Tanpa handler ini, upgrade skema bisa menggantung diam-diam (blocked) atau gagal
// senyap (VersionError) dan baru muncul sebagai error di query pertama.
// Catatan: JANGAN memakai ErrorService di sini — ia menulis ke db.errors, sehingga
// saat DB justru bermasalah, logging bisa ikut menggantung. Pakai console + event.
export interface DbIssue { level: 'warning' | 'error'; message: string; }

// Buffer isu yang di-dispatch SEBELUM ada listener. `db.open().catch()` berjalan saat
// modul dimuat — lebih awal dari mount React → listener toast belum ada. Konsumen
// (useDbIssueListener) menguras buffer ini saat mount agar kegagalan buka DB awal tetap
// tersurface, bukan hilang. Saat listener aktif, isu langsung lewat event (tak di-buffer)
// agar tak menumpuk / tampil-ganda.
const pendingDbIssues: DbIssue[] = [];
let dbIssueListenerAttached = false;

/** Ambil & kosongkan isu DB yang ter-buffer sebelum listener terpasang. */
export function drainPendingDbIssues(): DbIssue[] {
  return pendingDbIssues.splice(0, pendingDbIssues.length);
}

/** Ditandai oleh useDbIssueListener: saat aktif, isu tak perlu di-buffer. */
export function setDbIssueListenerAttached(attached: boolean) {
  dbIssueListenerAttached = attached;
}

function notifyDbIssue(level: 'warning' | 'error', message: string) {
  if (level === 'error') console.error(`[DB] ${message}`);
  else console.warn(`[DB] ${message}`);
  if (typeof window !== 'undefined') {
    if (!dbIssueListenerAttached) pendingDbIssues.push({ level, message });
    window.dispatchEvent(new CustomEvent('aetherscribe-db-issue', { detail: { level, message } }));
  }
}

// Tab/koneksi lain ingin upgrade ke skema lebih baru → tutup koneksi ini agar
// upgrade-nya bisa lanjut. Di main thread, muat ulang agar memakai skema/kode terbaru.
db.on('versionchange', () => {
  // Simpan dulu edit editor yang belum ter-persist (autosave di-debounce) selagi
  // koneksi ini MASIH terbuka — jika langsung close+reload, edit ter-debounce ikut
  // terbuang. flushActiveEditor() no-op bila editor tak sedang ter-mount.
  const closeAndReload = () => {
    db.close();
    if (typeof window !== 'undefined') {
      notifyDbIssue('warning', 'Database diperbarui di tab lain. Memuat ulang halaman…');
      window.location.reload();
    }
  };
  void flushActiveEditor().then(closeAndReload, () => {
    notifyDbIssue('error', 'Draft belum tersimpan. Muat ulang dibatalkan. Tetap di tab ini dan coba simpan ulang sebelum menutupnya.');
  });
  // Dexie menutup koneksi otomatis kecuali subscriber mengembalikan false.
  // Pertahankan koneksi sampai flush berhasil, termasuk saat save gagal.
  return false;
});

// Upgrade di koneksi ini terblokir oleh koneksi lama yang belum menutup (tab lain).
db.on('blocked', () => {
  notifyDbIssue('warning', 'Pembaruan database terblokir. Tutup tab AetherScribe lain agar pembaruan selesai.');
});

// Buka eksplisit untuk menangkap kegagalan (VersionError/kuota/korup) lebih awal.
db.open().catch((err: any) => {
  notifyDbIssue('error', 'Gagal membuka database: ' + (err?.message || String(err)));
});

// Inisialisasi proyek bawaan bila belum ada satu pun proyek di DB.
export async function ensureDefaultProject() {
  const count = await db.projects.count();
  if (count === 0) {
    const projectId = await db.projects.add({
      name: 'Novel Tanpa Judul',
      description: 'Mulailah mahakarya Anda di sini.',
      createdAt: Date.now(),
      lastOpened: Date.now(),
    });
    
    await db.chapters.add({
      projectId,
      title: 'Bab 1',
      content: 'Pada suatu hari…',
      order: 0,
      lastModified: Date.now(),
    });

    await db.bible.add({
      projectId,
      key: 'Nada',
      instruction: 'Gelap dan atmosferik'
    });
    
    return projectId;
  }
  const latest = await db.projects.orderBy('lastOpened').reverse().first();
  return latest?.id;
}

export async function cleanupAILogs() {
  try {
    const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
    const deleteCount = await db.aiUsageLogs.where('timestamp').below(thirtyDaysAgo).delete();
    if (deleteCount > 0) {
      console.log(`Cleaned up ${deleteCount} old AI usage logs.`);
    }
  } catch (err) {
    console.error('Failed to cleanup AI usage logs:', err);
  }
}

