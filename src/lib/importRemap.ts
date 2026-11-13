import { validateBackup } from './backupValidation';
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  Project, Chapter, CodexEntry, StoryBibleRule, AIAction,
  Snapshot, TimelineEvent, Relationship, ChatSession, CustomCategory, PlotPromise, GlossaryEntry,
  MapMarker, ContinuityTriage,
} from '@/src/types';

/**
 * Logika MURNI untuk impor per-novel (#4B). Tanpa akses IndexedDB — id baru
 * ditetapkan oleh Dexie di service, lalu peta id lama→baru diberikan ke sini untuk
 * menulis ulang seluruh foreign-key. Diuji terisolasi (importRemap.test.ts) karena
 * inilah bagian paling rawan: satu FK terlewat = relasi/timeline salah tunjuk senyap.
 *
 * Peta FK (dari src/types.ts):
 *  - *.projectId → satu id proyek baru
 *  - snapshots.chapterId (wajib), timeline.chapterId?, chatSessions.chapterId? +
 *    activeChapterId? → chapterIdMap
 *  - relationships.sourceId/targetId, timeline.characterIds[] → codexIdMap
 *  - plotPromises.codexId? & payoffCodexId? → codexIdMap, plotPromises.plantedChapterId? → chapterIdMap
 *  - glossary: hanya projectId (tak menautkan tabel lain)
 *  - maps: hanya projectId (di-insert lebih dulu oleh service utk membangun mapIdMap;
 *    gambar didekode dari data URL di service, bukan di sini)
 *  - mapMarkers.mapId → mapIdMap (buang penanda bila peta hilang), codexId? → codexIdMap
 *  - continuityTriage.findingId: Codex/relasi/timeline melalui remapTriage sesudah ID dependen tersedia.
 *  - chatSessions.workshopKey entry:<id>: codexIdMap; new:<seed> tetap literal.
 *  - TIDAK di-remap: Chapter.pov (nama), CodexEntry.category & key/slug (string).
 */

/** Bentuk `data` dari file ekspor per-novel (mirror BackupData['data'], bertipe kuat). */
export interface ProjectBackupData {
  projects: Project[];
  chapters: Chapter[];
  codex: CodexEntry[];
  bible: StoryBibleRule[];
  aiActions: AIAction[];
  snapshots: Snapshot[];
  timeline: TimelineEvent[];
  relationships: Relationship[];
  chatSessions: ChatSession[];
  codexCategories?: CustomCategory[];
  plotPromises?: PlotPromise[];
  glossary?: GlossaryEntry[];
  /** Peta Atlas — gambar tersimpan sebagai data URL (`imageDataUrl`), didekode di service. */
  maps?: any[];
  mapMarkers?: MapMarker[];
  continuityTriage?: ContinuityTriage[];
}

export interface RemapMaps {
  /** Id proyek baru (hasil db.projects.add di service). */
  projectId: number;
  /** id bab lama → id bab baru. */
  chapterIdMap: Map<number, number>;
  /** id codex lama → id codex baru. */
  codexIdMap: Map<number, number>;
  /** id peta Atlas lama → id baru (peta di-insert lebih dulu oleh service). */
  mapIdMap: Map<number, number>;
  relationshipIdMap?: Map<number, number>;
  timelineIdMap?: Map<number, number>;
}

/** ID temuan adalah protokol terstruktur; jangan mengganti angka dalam teks bebas. */
export function remapTriage(data: ProjectBackupData, maps: RemapMaps): ContinuityTriage[] {
  const mapFinding = (value: string): string | undefined => {
    let match = /^(gap|unused)-(\d+)$/.exec(value);
    if (match) { const id = maps.codexIdMap.get(Number(match[2])); return id === undefined ? undefined : `${match[1]}-${id}`; }
    match = /^(rel|tl)-(\d+)$/.exec(value);
    if (match) { const id = (match[1] === 'rel' ? maps.relationshipIdMap : maps.timelineIdMap)?.get(Number(match[2])); return id === undefined ? undefined : `${match[1]}-${id}`; }
    match = /^rel-(\d+)-(\d+)$/.exec(value);
    if (match) { const a = maps.codexIdMap.get(Number(match[1])), b = maps.codexIdMap.get(Number(match[2])); return a === undefined || b === undefined ? undefined : `rel-${a}-${b}`; }
    match = /^chrono-(invalid-range|same-chapter|retro-chap)-(\d+)(?:-(\d+))?$/.exec(value);
    if (match) {
      if ((match[1] === 'invalid-range') !== (match[3] === undefined)) throw new Error('Format findingId kronologi tidak valid.');
      const a = maps.timelineIdMap?.get(Number(match[2]));
      const b = match[3] === undefined ? undefined : maps.timelineIdMap?.get(Number(match[3]));
      if (a === undefined || (match[3] !== undefined && b === undefined)) return undefined;
      return `chrono-${match[1]}-${a}${b === undefined ? '' : `-${b}`}`;
    }
    // Format asing ditolak agar status tidak diam-diam hilang atau salah menunjuk.
    throw new Error(`Format findingId triage tidak dikenali: ${value}`);
  };
  return (data.continuityTriage ?? []).flatMap(row => {
    const findingId = mapFinding(row.findingId);
    return findingId === undefined ? [] : [{ ...stripId(row), projectId: maps.projectId, findingId }];
  });
}

/** Tabel dependen hasil remap (id dilepas; siap bulkAdd). */
export interface RemappedDependents {
  bible: StoryBibleRule[];
  aiActions: AIAction[];
  codexCategories: CustomCategory[];
  snapshots: Snapshot[];
  timeline: TimelineEvent[];
  relationships: Relationship[];
  chatSessions: ChatSession[];
  plotPromises: PlotPromise[];
  glossary: GlossaryEntry[];
  mapMarkers: MapMarker[];
}

/** Salin baris tanpa `id` (agar Dexie menetapkan id baru). */
function stripId<T extends Record<string, any>>(row: T): Omit<T, 'id'> {
  const rest: Record<string, any> = { ...row };
  delete rest.id;
  return rest as Omit<T, 'id'>;
}

/** Dedup baris berdasarkan kunci turunan (defensif untuk index unik). */
function dedupeBy<T>(rows: T[], key: (row: T) => string): T[] {
  const seen = new Set<string>();
  return rows.filter((r) => {
    const k = key(r);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/**
 * Menulis ulang FK tabel dependen memakai peta id baru. Kebijakan referensi
 * menggantung eksplisit (buang baris yatim / saring id tak dikenal) — lihat komentar
 * per-tabel. Tabel primer (projects/chapters/codex) di-insert lebih dulu oleh service
 * untuk MEMBANGUN peta ini, jadi tidak ditangani di sini.
 */
export function remapProjectDependents(
  data: ProjectBackupData,
  maps: RemapMaps,
): RemappedDependents {
  const { projectId, chapterIdMap, codexIdMap, mapIdMap } = maps;

  // bible: set projectId; dedup by key (index unik [projectId+key]) secara defensif.
  const bible = dedupeBy(data.bible ?? [], (b) => b.key).map((b) => ({
    ...stripId(b),
    projectId,
  }));

  // aiActions: hanya projectId.
  const aiActions = (data.aiActions ?? []).map((a) => ({ ...stripId(a), projectId }));

  // codexCategories: set projectId; dedup by slug (index unik [projectId+slug]).
  const codexCategories = dedupeBy(data.codexCategories ?? [], (c) => c.slug).map((c) => ({
    ...stripId(c),
    projectId,
  }));

  // snapshots: chapterId WAJIB → buang baris bila bab-nya tak dikenal (yatim).
  const snapshots = (data.snapshots ?? [])
    .map((s) => {
      const newChapterId = chapterIdMap.get(s.chapterId);
      if (newChapterId === undefined) return null;
      return { ...stripId(s), chapterId: newChapterId };
    })
    .filter((s): s is Omit<Snapshot, 'id'> & { chapterId: number } => s !== null);

  // timeline: set projectId; chapterId opsional (buang key bila tak dikenal);
  // characterIds → map tiap elemen & saring yang tak dikenal.
  const timeline = (data.timeline ?? []).map((t) => {
    const remapped: Record<string, any> = { ...stripId(t), projectId };
    if (t.chapterId !== undefined) {
      const nc = chapterIdMap.get(t.chapterId);
      if (nc !== undefined) remapped.chapterId = nc;
      else delete remapped.chapterId;
    }
    if (t.characterIds) {
      remapped.characterIds = t.characterIds
        .map((cid) => codexIdMap.get(cid))
        .filter((cid): cid is number => cid !== undefined);
    }
    return remapped as TimelineEvent;
  });

  // relationships: remap source & target; buang relasi bila salah satu ujung hilang.
  const relationships = (data.relationships ?? [])
    .map((r) => {
      const s = codexIdMap.get(r.sourceId);
      const t = codexIdMap.get(r.targetId);
      if (s === undefined || t === undefined) return null;
      return { ...stripId(r), projectId, sourceId: s, targetId: t };
    })
    .filter((r): r is Omit<Relationship, 'id'> & { projectId: number; sourceId: number; targetId: number } => r !== null);

  // chatSessions: set projectId; chapterId & activeChapterId opsional (buang key bila
  // tak dikenal); `messages` (teks chat) tak disentuh.
  const chatSessions = (data.chatSessions ?? []).map((cs) => {
    const remapped: Record<string, any> = { ...stripId(cs), projectId };
    if (cs.chapterId !== undefined) {
      const nc = chapterIdMap.get(cs.chapterId);
      if (nc !== undefined) remapped.chapterId = nc;
      else delete remapped.chapterId;
    }
    if (cs.activeChapterId !== undefined) {
      const nc = chapterIdMap.get(cs.activeChapterId);
      if (nc !== undefined) remapped.activeChapterId = nc;
      else delete remapped.activeChapterId;
    }
    if (cs.workshopKey?.startsWith('entry:')) {
      const match = /^entry:(\d+)$/.exec(cs.workshopKey);
      const entry = match ? codexIdMap.get(Number(match[1])) : undefined;
      if (entry === undefined) throw new Error('Target sesi workshop tidak valid.');
      remapped.workshopKey = `entry:${entry}`;
    }
    return remapped as ChatSession;
  });

  // plotPromises: set projectId; codexId, payoffCodexId & plantedChapterId opsional
  // (buang key bila tak dikenal — janji jadi berbasis judul/keyword saja, tetap valid).
  // keywords tak disentuh.
  const plotPromises = (data.plotPromises ?? []).map((p) => {
    const remapped: Record<string, any> = { ...stripId(p), projectId };
    if (p.codexId !== undefined) {
      const nc = codexIdMap.get(p.codexId);
      if (nc !== undefined) remapped.codexId = nc;
      else delete remapped.codexId;
    }
    if (p.payoffCodexId !== undefined) {
      const nc = codexIdMap.get(p.payoffCodexId);
      if (nc !== undefined) remapped.payoffCodexId = nc;
      else delete remapped.payoffCodexId;
    }
    if (p.plantedChapterId !== undefined) {
      const nc = chapterIdMap.get(p.plantedChapterId);
      if (nc !== undefined) remapped.plantedChapterId = nc;
      else delete remapped.plantedChapterId;
    }
    return remapped as PlotPromise;
  });

  // glossary: hanya set projectId (tak ada FK ke tabel lain).
  const glossary = (data.glossary ?? []).map((g) => ({ ...stripId(g), projectId }));

  // mapMarkers: remap mapId (WAJIB) → buang penanda bila petanya tak dikenal (yatim);
  // codexId opsional (buang key bila tak dikenal — penanda jadi berbasis title/note saja).
  const mapMarkers = (data.mapMarkers ?? [])
    .map((mk) => {
      const newMapId = mapIdMap.get(mk.mapId);
      if (newMapId === undefined) return null;
      const remapped: Record<string, any> = { ...stripId(mk), projectId, mapId: newMapId };
      if (mk.codexId !== undefined) {
        const nc = codexIdMap.get(mk.codexId);
        if (nc !== undefined) remapped.codexId = nc;
        else delete remapped.codexId;
      }
      if (mk.linkedMapId !== undefined) {
        const nlm = mapIdMap.get(mk.linkedMapId);
        if (nlm !== undefined) remapped.linkedMapId = nlm;
        else delete remapped.linkedMapId;
      }
      return remapped as MapMarker;
    })
    .filter((mk): mk is MapMarker => mk !== null);

  return { bible, aiActions, codexCategories, snapshots, timeline, relationships, chatSessions, plotPromises, glossary, mapMarkers };
}

/**
 * Nama untuk proyek hasil impor — diberi suffix "(impor)" agar terbedakan dari aslinya
 * bila keduanya ada di ruang kerja yang sama. Idempoten: mengimpor ulang file yang sudah
 * ber-suffix tidak menumpuk "(impor) (impor)".
 */
export function importedProjectName(name: string | undefined): string {
  const base = (name || 'Novel').trim();
  return /\(impor\)\s*$/i.test(base) ? base : `${base} (impor)`;
}

export interface ProjectBackupCounts {
  chapters: number;
  codex: number;
  timeline: number;
  relationships: number;
  chatSessions: number;
  plotPromises: number;
}

/** Ringkasan jumlah untuk dialog konfirmasi impor. */
export function summarizeProjectBackup(data: ProjectBackupData): ProjectBackupCounts {
  return {
    chapters: data.chapters?.length ?? 0,
    codex: data.codex?.length ?? 0,
    timeline: data.timeline?.length ?? 0,
    relationships: data.relationships?.length ?? 0,
    chatSessions: data.chatSessions?.length ?? 0,
    plotPromises: data.plotPromises?.length ?? 0,
  };
}

/**
 * Validasi fail-closed sebelum menyentuh DB. Melempar pesan Indonesia bila file bukan
 * ekspor SATU novel. (Jalur impor kebalikan dari restore-penuh: hanya menerima
 * scope:'project'.) Checksum diverifikasi terpisah di service memakai computeChecksum.
 */
export function validateProjectBackup(backup: unknown): void {
  validateBackup(backup, 'project');
}
