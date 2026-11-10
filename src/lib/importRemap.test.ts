/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import {
  remapProjectDependents,
  summarizeProjectBackup,
  validateProjectBackup,
  importedProjectName,
  type ProjectBackupData,
  type RemapMaps,
} from './importRemap';

// Peta id lama→baru dipakai di semua tes remap.
const maps: RemapMaps = {
  projectId: 5,
  chapterIdMap: new Map([[10, 100], [11, 101]]),
  codexIdMap: new Map([[20, 200], [21, 201]]),
  mapIdMap: new Map([[30, 300], [31, 301]]),
};

function sampleData(): ProjectBackupData {
  return {
    projects: [{ id: 9, name: 'Novel', description: '', createdAt: 1, lastOpened: 1 }],
    chapters: [
      { id: 10, projectId: 9, title: 'Bab 1', content: '', order: 0, lastModified: 1 },
      { id: 11, projectId: 9, title: 'Bab 2', content: '', order: 1, lastModified: 1 },
    ],
    codex: [
      { id: 20, projectId: 9, name: 'Aria', aliases: [], category: 'character', description: '', tags: [] },
      { id: 21, projectId: 9, name: 'Bael', aliases: [], category: 'character', description: '', tags: [] },
    ],
    bible: [
      { id: 1, projectId: 9, key: 'Tone', instruction: 'dark' },
      { id: 2, projectId: 9, key: 'Tone', instruction: 'duplikat — harus dibuang' },
      { id: 3, projectId: 9, key: 'POV', instruction: 'orang ketiga' },
    ],
    aiActions: [{ id: 4, projectId: 9, label: 'Ringkas', prompt: 'x' }],
    codexCategories: [
      { id: 5, projectId: 9, slug: 'faction', label: 'Faksi', icon: 'i', color: 'c', order: 0 },
      { id: 6, projectId: 9, slug: 'faction', label: 'duplikat', icon: 'i', color: 'c', order: 1 },
    ],
    snapshots: [
      { id: 7, chapterId: 10, content: 'a', label: 'v1', timestamp: 1 },
      { id: 8, chapterId: 999, content: 'yatim', label: 'v2', timestamp: 2 },
    ],
    timeline: [
      { id: 9, projectId: 9, chapterId: 11, title: 'T1', description: '', type: 'plot', order: 0, characterIds: [20, 999, 21] },
      { id: 10, projectId: 9, chapterId: 888, title: 'T2', description: '', type: 'plot', order: 1 },
    ],
    relationships: [
      { id: 11, projectId: 9, sourceId: 20, targetId: 21, type: 'ally' },
      { id: 12, projectId: 9, sourceId: 20, targetId: 999, type: 'enemy' },
    ],
    chatSessions: [
      { id: 13, projectId: 9, title: 'S1', messages: [{ role: 'user', content: 'hi', timestamp: 1 }], lastMessageAt: 1, chapterId: 10, activeChapterId: 11 },
      { id: 14, projectId: 9, title: 'S2', messages: [], lastMessageAt: 2, chapterId: 777 },
    ],
    plotPromises: [
      { id: 15, projectId: 9, title: 'Belati', codexId: 20, plantedChapterId: 10, payoffCodexId: 21, status: 'open', createdAt: 1, updatedAt: 1 },
      { id: 16, projectId: 9, title: 'Ramalan', keywords: ['ramalan'], codexId: 999, plantedChapterId: 888, payoffCodexId: 999, status: 'open', createdAt: 1, updatedAt: 1 },
    ],
    glossary: [
      { id: 17, projectId: 9, term: 'liga', variants: ['leage'], createdAt: 1, updatedAt: 1 },
    ],
    mapMarkers: [
      { id: 40, projectId: 9, mapId: 30, kind: 'pin', geometry: { x: 0.5, y: 0.5 }, codexId: 20, linkedMapId: 31, createdAt: 1 },
      { id: 41, projectId: 9, mapId: 31, kind: 'area', geometry: [{ x: 0, y: 0 }], codexId: 999, linkedMapId: 999, createdAt: 1 },
      { id: 42, projectId: 9, mapId: 999, kind: 'route', geometry: [{ x: 0, y: 0 }], createdAt: 1 },
    ],
  };
}

describe('remapProjectDependents', () => {
  it('menyetel projectId baru di semua tabel ber-projectId', () => {
    const r = remapProjectDependents(sampleData(), maps);
    for (const b of r.bible) expect(b.projectId).toBe(5);
    for (const a of r.aiActions) expect(a.projectId).toBe(5);
    for (const c of r.codexCategories) expect(c.projectId).toBe(5);
    for (const t of r.timeline) expect(t.projectId).toBe(5);
    for (const rel of r.relationships) expect(rel.projectId).toBe(5);
    for (const cs of r.chatSessions) expect(cs.projectId).toBe(5);
    for (const p of r.plotPromises) expect(p.projectId).toBe(5);
  });

  it('selalu melepas id lama (Dexie yang menetapkan id baru)', () => {
    const r = remapProjectDependents(sampleData(), maps);
    const all = [...r.bible, ...r.aiActions, ...r.codexCategories, ...r.snapshots, ...r.timeline, ...r.relationships, ...r.chatSessions, ...r.plotPromises, ...r.glossary];
    for (const row of all) expect('id' in row).toBe(false);
  });

  it('remap plotPromises: codexId, payoffCodexId & plantedChapterId (buang bila tak dikenal), keywords tetap', () => {
    const r = remapProjectDependents(sampleData(), maps);
    expect(r.plotPromises).toHaveLength(2);
    // P1: codexId 20→200, plantedChapterId 10→100, payoffCodexId 21→201
    expect(r.plotPromises[0].codexId).toBe(200);
    expect(r.plotPromises[0].plantedChapterId).toBe(100);
    expect(r.plotPromises[0].payoffCodexId).toBe(201);
    // P2: codexId 999, plantedChapterId 888 & payoffCodexId 999 tak dikenal → key dibuang; keywords tak disentuh
    expect(r.plotPromises[1].codexId).toBeUndefined();
    expect(r.plotPromises[1].plantedChapterId).toBeUndefined();
    expect(r.plotPromises[1].payoffCodexId).toBeUndefined();
    expect(r.plotPromises[1].keywords).toEqual(['ramalan']);
  });

  it('remap mapMarkers: mapId, codexId & linkedMapId di-remap, penanda yatim (peta hilang) dibuang', () => {
    const r = remapProjectDependents(sampleData(), maps);
    // M3 (mapId 999 tak dikenal) dibuang → sisa 2.
    expect(r.mapMarkers).toHaveLength(2);
    // M1: mapId 30→300, codexId 20→200, linkedMapId 31→301.
    expect(r.mapMarkers[0].mapId).toBe(300);
    expect(r.mapMarkers[0].codexId).toBe(200);
    expect(r.mapMarkers[0].linkedMapId).toBe(301);
    expect(r.mapMarkers[0].projectId).toBe(5);
    // M2: mapId 31→301, codexId 999 tak dikenal → dibuang, linkedMapId 999 tak dikenal → dibuang.
    expect(r.mapMarkers[1].mapId).toBe(301);
    expect(r.mapMarkers[1].codexId).toBeUndefined();
    expect(r.mapMarkers[1].linkedMapId).toBeUndefined();
    for (const mk of r.mapMarkers) expect('id' in mk).toBe(false);
  });

  it('remap glossary: hanya set projectId (tanpa FK lain), id dilepas', () => {
    const r = remapProjectDependents(sampleData(), maps);
    expect(r.glossary).toHaveLength(1);
    expect(r.glossary[0].projectId).toBe(5);
    expect(r.glossary[0].term).toBe('liga');
    expect(r.glossary[0].variants).toEqual(['leage']);
    expect('id' in r.glossary[0]).toBe(false);
  });

  it('dedup bible by key & codexCategories by slug', () => {
    const r = remapProjectDependents(sampleData(), maps);
    expect(r.bible.map((b) => b.key).sort()).toEqual(['POV', 'Tone']);
    expect(r.codexCategories).toHaveLength(1);
    expect(r.codexCategories[0].slug).toBe('faction');
    expect(r.codexCategories[0].label).toBe('Faksi'); // yang pertama menang
  });

  it('remap snapshots.chapterId & buang snapshot yatim', () => {
    const r = remapProjectDependents(sampleData(), maps);
    expect(r.snapshots).toHaveLength(1);
    expect(r.snapshots[0].chapterId).toBe(100);
  });

  it('remap timeline.chapterId (buang bila tak dikenal) & saring characterIds', () => {
    const r = remapProjectDependents(sampleData(), maps);
    expect(r.timeline).toHaveLength(2);
    // T1: chapterId 11→101, characterIds [20,999,21] → [200,201] (999 disaring)
    expect(r.timeline[0].chapterId).toBe(101);
    expect(r.timeline[0].characterIds).toEqual([200, 201]);
    // T2: chapterId 888 tak dikenal → key dibuang
    expect('chapterId' in r.timeline[1]).toBe(false);
  });

  it('remap relationships & buang bila salah satu ujung hilang', () => {
    const r = remapProjectDependents(sampleData(), maps);
    expect(r.relationships).toHaveLength(1);
    expect(r.relationships[0].sourceId).toBe(200);
    expect(r.relationships[0].targetId).toBe(201);
  });

  it('remap chatSessions chapterId & activeChapterId (buang key bila tak dikenal)', () => {
    const r = remapProjectDependents(sampleData(), maps);
    expect(r.chatSessions).toHaveLength(2);
    expect(r.chatSessions[0].chapterId).toBe(100);
    expect(r.chatSessions[0].activeChapterId).toBe(101);
    // messages tetap utuh
    expect(r.chatSessions[0].messages).toHaveLength(1);
    // S2: chapterId 777 tak dikenal → dibuang
    expect('chapterId' in r.chatSessions[1]).toBe(false);
  });

  it('tidak melempar untuk data kosong / field opsional absen', () => {
    const empty: ProjectBackupData = {
      projects: [], chapters: [], codex: [], bible: [], aiActions: [],
      snapshots: [], timeline: [], relationships: [], chatSessions: [],
    };
    const r = remapProjectDependents(empty, maps);
    expect(r.snapshots).toEqual([]);
    expect(r.codexCategories).toEqual([]); // codexCategories opsional (undefined) aman
  });
});

describe('validateProjectBackup', () => {
  it('lolos untuk file ekspor satu novel yang valid', () => {
    expect(() => validateProjectBackup({ version: 7, timestamp: 1, scope: 'project', data: { projects: sampleData().projects, chapters: sampleData().chapters, codex: sampleData().codex } })).not.toThrow();
  });

  it('menolak cadangan penuh (scope != project)', () => {
    expect(() => validateProjectBackup({ version: 7, timestamp: 1, scope: 'all', data: sampleData() })).toThrow(/bukan file ekspor per-novel/i);
    expect(() => validateProjectBackup({ version: 7, timestamp: 1, data: sampleData() })).toThrow(/bukan file ekspor per-novel/i);
  });

  it('menolak file berisi lebih dari satu proyek', () => {
    const multi = { version: 7, timestamp: 1, scope: 'project', data: { ...sampleData(), projects: [{}, {}] } };
    expect(() => validateProjectBackup(multi)).toThrow(/bukan ekspor satu novel/i);
  });

  it('menolak bentuk tak valid', () => {
    expect(() => validateProjectBackup(null)).toThrow();
    expect(() => validateProjectBackup({ scope: 'project' })).toThrow(/tidak valid/i);
  });
});

describe('summarizeProjectBackup', () => {
  it('menghitung jumlah untuk dialog konfirmasi', () => {
    expect(summarizeProjectBackup(sampleData())).toEqual({
      chapters: 2, codex: 2, timeline: 2, relationships: 2, chatSessions: 2, plotPromises: 2,
    });
  });
});

describe('importedProjectName', () => {
  it('menambahkan suffix (impor)', () => {
    expect(importedProjectName('Novel')).toBe('Novel (impor)');
    expect(importedProjectName('  Kisah  ')).toBe('Kisah (impor)');
  });

  it('idempoten — tidak menumpuk suffix', () => {
    expect(importedProjectName('Novel (impor)')).toBe('Novel (impor)');
    expect(importedProjectName('Novel (Impor)')).toBe('Novel (Impor)');
  });

  it('memberi nama default bila kosong/undefined', () => {
    expect(importedProjectName(undefined)).toBe('Novel (impor)');
    expect(importedProjectName('')).toBe('Novel (impor)');
  });
});
