/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Integritas referensi graf lore (#9) — logika murni, TANPA AI, TANPA Dexie.
 *
 * Codex bukan kumpulan entri terisolasi: entri saling merujuk lewat relasi bertipe
 * (`relationships`), sebutan nama di deskripsi satu sama lain, dan tautan payoff dari
 * Janji Plot. Modul ini menurunkan graf dua-arah dari data yang SUDAH ada (tak ada
 * tabel/field baru) dan menjawab dua pertanyaan yang selama ini senyap:
 *
 *   1. BACKLINK — "apa yang menunjuk ke entri ini?" (kebalikan dari LinkifiedDescription
 *      yang hanya menampilkan arah maju). Sumber: sebutan nama di deskripsi entri lain,
 *      relasi bertipe, dan `PlotPromise.payoffCodexId`.
 *   2. TAUTAN MENGGANTUNG — FK tersimpan (relasi / janji) yang menunjuk entri yang sudah
 *      terhapus. UI biasa MENYEMBUNYIKANNYA diam-diam (mis. `CodexDetailModal` melewati
 *      relasi tanpa target); di sini ia justru DILAPORKAN.
 *
 * Deterministik & on-demand (pola `buildPresenceIndex`): satu scan Aho-Corasick atas
 * nama+alias untuk sebutan. Menyoal konsistensi lore ITU SENDIRI, bukan prosa bab.
 */

import { AhoCorasick } from '@/src/lib/ahoCorasick';
import { extractCodexAcKeywords } from '@/src/lib/codexKeywords';
import { CodexEntry, Relationship, PlotPromise } from '@/src/types';

/** Lewat jalur apa sebuah entri menautkan ke entri lain. */
export type LoreLinkVia = 'relationship' | 'mention' | 'payoff';

/** Satu tautan masuk ke sebuah entri (siapa yang menunjuk ke sana). */
export interface LoreBacklink {
  /** Entri sumber yang menautkan. */
  sourceId: number;
  sourceName: string;
  via: LoreLinkVia;
  /** Label tambahan untuk `relationship` (tipe relasi) / judul janji untuk `payoff`. */
  label?: string;
}

export type DanglingKind = 'relationship' | 'promise-codex' | 'promise-payoff';

/** Referensi FK tersimpan yang menunjuk entri Codex yang tidak ada lagi. */
export interface DanglingRef {
  /** Kunci stabil untuk React & dedup. */
  id: string;
  kind: DanglingKind;
  /** Deskripsi ringkas untuk UI, mis. `Relasi "Musuh" dari Kaelen`. */
  ownerLabel: string;
  /** ID codex yang hilang (target yatim). */
  missingTargetId: number;
  /** ID relasi terkait (kind 'relationship') — untuk tombol perbaiki/hapus. */
  relationshipId?: number;
  /** ID janji terkait (kind 'promise-*'). */
  promiseId?: number;
}

export interface LoreGraph {
  /** codexId → daftar tautan masuk (terurut nama sumber). */
  backlinks: Map<number, LoreBacklink[]>;
  /** Semua tautan menggantung, terurut deterministik. */
  dangling: DanglingRef[];
}

/**
 * Simpul graf = satu entri Codex. `degree` = jumlah edge yang menyentuhnya (untuk
 * ukuran node & mendeteksi entri "sebatang kara" = degree 0).
 */
export interface LoreGraphNode {
  id: number;
  name: string;
  category: string;
  hidden: boolean;
  degree: number;
}

/**
 * Edge graf — TAK berarah (dipakai layout force-directed). `source`/`target` selalu
 * berupa id codex yang ADA (edge menggantung disaring; itu ranah `dangling`).
 */
export interface LoreGraphViewLink {
  source: number;
  target: number;
  via: LoreLinkVia;
  /** Tipe relasi (`relationship`) / judul janji (`payoff`). */
  label?: string;
}

export interface LoreGraphView {
  nodes: LoreGraphNode[];
  links: LoreGraphViewLink[];
}

/** Satu sebutan nama: entri `sourceId` menyebut entri `mentionedId` di teksnya. */
export interface LoreMention {
  sourceId: number;
  mentionedId: number;
}

/**
 * SATU scan Aho-Corasick nama+alias atas `description`+`secret` tiap entri → daftar
 * pasangan (penyebut → yang disebut). SUMBER TUNGGAL untuk `buildLoreGraph` (backlink)
 * & `buildLoreGraphView` (edge) — dulu blok ini diduplikasi verbatim di keduanya.
 */
export function scanMentions(entries: CodexEntry[]): LoreMention[] {
  const keywords = extractCodexAcKeywords(entries, (e) => e.id!);
  const ac = keywords.length ? new AhoCorasick(keywords) : null;
  if (!ac) return [];

  const mentions: LoreMention[] = [];
  for (const e of entries) {
    if (e.id == null) continue;
    // Sebutan dipindai dari teks yang HANYA dilihat penulis (deskripsi + kebenaran
    // tersembunyi). Backlink adalah permukaan penulis, jadi aman menyertakan `secret`.
    const text = `${e.description || ''}\n${e.secret || ''}`;
    if (!text.trim()) continue;
    for (const m of ac.search(text)) {
      mentions.push({ sourceId: e.id, mentionedId: m.data as number });
    }
  }
  return mentions;
}

/**
 * Bangun graf lore dari entri Codex + relasi + janji plot.
 *
 * @param entries       seluruh entri Codex proyek.
 * @param relationships relasi bertipe antar-entri.
 * @param promises      janji plot (opsional; hanya dipakai untuk backlink/dangling payoff).
 */
export function buildLoreGraph(
  entries: CodexEntry[],
  relationships: Relationship[] = [],
  promises: PlotPromise[] = [],
  mentions = scanMentions(entries),
): LoreGraph {
  const byId = new Map<number, CodexEntry>();
  for (const e of entries) {
    if (e.id != null) byId.set(e.id, e);
  }

  const backlinks = new Map<number, LoreBacklink[]>();
  // Dedup: satu tautan per (target, source, via). Sebutan berulang / banyak alias
  // dari sumber yang sama tidak menghasilkan backlink ganda.
  const seen = new Set<string>();

  const addBacklink = (targetId: number, link: LoreBacklink) => {
    if (targetId === link.sourceId) return; // abaikan tautan ke diri sendiri
    const key = `${targetId}:${link.sourceId}:${link.via}`;
    if (seen.has(key)) return;
    seen.add(key);
    const list = backlinks.get(targetId);
    if (list) list.push(link);
    else backlinks.set(targetId, [link]);
  };

  // --- Sebutan nama (scan bersama `scanMentions`) --------------------------
  for (const { sourceId, mentionedId } of mentions) {
    const src = byId.get(sourceId);
    if (src) addBacklink(mentionedId, { sourceId, sourceName: src.name, via: 'mention' });
  }

  // --- Relasi bertipe (dua arah) -------------------------------------------
  for (const rel of relationships) {
    const src = byId.get(rel.sourceId);
    const tgt = byId.get(rel.targetId);
    // Relasi utuh → backlink dua arah. Ujung yang hilang ditangani sebagai dangling.
    if (src && tgt) {
      addBacklink(rel.targetId, { sourceId: rel.sourceId, sourceName: src.name, via: 'relationship', label: rel.type });
      addBacklink(rel.sourceId, { sourceId: rel.targetId, sourceName: tgt.name, via: 'relationship', label: rel.type });
    }
  }

  // --- Payoff Janji Plot ----------------------------------------------------
  for (const p of promises) {
    if (p.payoffCodexId == null) continue;
    const tgt = byId.get(p.payoffCodexId);
    if (!tgt) continue; // hilang → ditangani sebagai dangling
    // Sumber payoff adalah janji, bukan entri Codex. `sourceId` diberi id janji negatif
    // agar tak bentrok dengan id codex; konsumen membedakan lewat `via: 'payoff'`.
    addBacklink(p.payoffCodexId, {
      sourceId: -(p.id ?? 0),
      sourceName: p.title,
      via: 'payoff',
      label: 'dibayar oleh janji',
    });
  }

  // Urutkan backlink tiap entri: relasi dulu, lalu sebutan, lalu payoff; nama menaik.
  const viaOrder: Record<LoreLinkVia, number> = { relationship: 0, mention: 1, payoff: 2 };
  for (const list of backlinks.values()) {
    list.sort((a, b) =>
      viaOrder[a.via] - viaOrder[b.via] || a.sourceName.localeCompare(b.sourceName, 'id'),
    );
  }

  // --- Tautan menggantung (perhitungan bersama, tanpa Aho-Corasick) ---------
  const dangling = findDanglingRefs(entries, relationships, promises);

  return { backlinks, dangling };
}

/**
 * Turunkan graf node-edge untuk VISUALISASI (#14) — nol tabel/field baru, deterministik.
 *
 * Berbeda dari `buildLoreGraph` yang menurunkan backlink PER-target (arah masuk), fungsi
 * ini menghasilkan daftar node + edge TAK berarah siap-render (force-directed): satu node
 * per entri Codex, satu edge per pasangan yang tertaut lewat relasi / sebutan / payoff.
 * Edge di-dedup sebagai pasangan tak-berurut agar A↔B tak muncul dua kali.
 *
 *   - `relationship` — relasi bertipe utuh (kedua ujung ada). Beda tipe antar-pasangan
 *     yang sama = edge terpisah (mis. "Saudara" & "Musuh"). Ujung menggantung diabaikan.
 *   - `mention`      — satu scan Aho-Corasick atas nama+alias di `description`+`secret`.
 *   - `payoff`       — janji yang punya `codexId` DAN `payoffCodexId` (keduanya ada) →
 *     edge setup→payoff. Janji tanpa entri subjek tak punya node untuk ditaut.
 *
 * `degree` tiap node dihitung dari edge final → node degree 0 = entri terisolasi.
 */
export function buildLoreGraphView(
  entries: CodexEntry[],
  relationships: Relationship[] = [],
  promises: PlotPromise[] = [],
  mentions = scanMentions(entries),
): LoreGraphView {
  const byId = new Map<number, CodexEntry>();
  for (const e of entries) {
    if (e.id != null) byId.set(e.id, e);
  }

  const links: LoreGraphViewLink[] = [];
  // Dedup pasangan tak-berurut. Relasi menyertakan label di kunci (tipe berbeda = edge
  // berbeda); sebutan & payoff cukup satu edge per pasangan+via.
  const seen = new Set<string>();
  const addLink = (a: number, b: number, via: LoreLinkVia, label?: string) => {
    if (a === b || !byId.has(a) || !byId.has(b)) return;
    const [lo, hi] = a < b ? [a, b] : [b, a];
    const key = via === 'relationship' ? `relationship:${lo}-${hi}:${label ?? ''}` : `${via}:${lo}-${hi}`;
    if (seen.has(key)) return;
    seen.add(key);
    links.push({ source: lo, target: hi, via, label });
  };

  // --- Relasi bertipe --------------------------------------------------------
  for (const rel of relationships) {
    addLink(rel.sourceId, rel.targetId, 'relationship', rel.type);
  }

  // --- Sebutan nama (scan bersama `scanMentions`) ----------------------------
  for (const { sourceId, mentionedId } of mentions) {
    addLink(sourceId, mentionedId, 'mention');
  }

  // --- Payoff Janji Plot (setup entri → entri pembayar) ----------------------
  for (const p of promises) {
    if (p.codexId != null && p.payoffCodexId != null) {
      addLink(p.codexId, p.payoffCodexId, 'payoff', p.title);
    }
  }

  // --- Node + degree ---------------------------------------------------------
  const degree = new Map<number, number>();
  for (const l of links) {
    degree.set(l.source, (degree.get(l.source) ?? 0) + 1);
    degree.set(l.target, (degree.get(l.target) ?? 0) + 1);
  }

  const nodes: LoreGraphNode[] = [];
  for (const e of entries) {
    if (e.id == null) continue;
    nodes.push({
      id: e.id,
      name: e.name,
      category: e.category,
      hidden: !!e.hidden,
      degree: degree.get(e.id) ?? 0,
    });
  }

  // Urutan deterministik (memudahkan tes; layout force menata ulang posisi sendiri).
  nodes.sort((a, b) => a.id - b.id);
  links.sort((a, b) => a.source - b.source || a.target - b.target || a.via.localeCompare(b.via) || (a.label ?? '').localeCompare(b.label ?? ''));

  return { nodes, links };
}

/**
 * Hanya tautan menggantung — tanpa membangun graf backlink (tanpa Aho-Corasick).
 * Dipakai banner integritas (#9 Fase 2) yang tak butuh sisi backlink, agar codex besar
 * tak membayar scan sebutan tiap kali data berubah.
 */
export function findDanglingRefs(
  entries: CodexEntry[],
  relationships: Relationship[] = [],
  promises: PlotPromise[] = [],
): DanglingRef[] {
  const ids = new Set<number>();
  for (const e of entries) {
    if (e.id != null) ids.add(e.id);
  }
  const byId = new Map<number, CodexEntry>();
  for (const e of entries) {
    if (e.id != null) byId.set(e.id, e);
  }

  const dangling: DanglingRef[] = [];

  for (const rel of relationships) {
    if (!ids.has(rel.sourceId)) {
      const other = byId.get(rel.targetId);
      dangling.push({
        id: `rel-${rel.id ?? `${rel.sourceId}-${rel.targetId}`}-src`,
        kind: 'relationship',
        ownerLabel: other ? `Relasi "${rel.type}" dengan ${other.name}` : `Relasi "${rel.type}"`,
        missingTargetId: rel.sourceId,
        relationshipId: rel.id,
      });
    }
    if (!ids.has(rel.targetId)) {
      const other = byId.get(rel.sourceId);
      dangling.push({
        id: `rel-${rel.id ?? `${rel.sourceId}-${rel.targetId}`}-tgt`,
        kind: 'relationship',
        ownerLabel: other ? `Relasi "${rel.type}" dari ${other.name}` : `Relasi "${rel.type}"`,
        missingTargetId: rel.targetId,
        relationshipId: rel.id,
      });
    }
  }

  for (const p of promises) {
    if (p.codexId != null && !ids.has(p.codexId)) {
      dangling.push({
        id: `promise-${p.id ?? p.title}-codex`,
        kind: 'promise-codex',
        ownerLabel: `Janji "${p.title}" tertaut entri`,
        missingTargetId: p.codexId,
        promiseId: p.id,
      });
    }
    if (p.payoffCodexId != null && !ids.has(p.payoffCodexId)) {
      dangling.push({
        id: `promise-${p.id ?? p.title}-payoff`,
        kind: 'promise-payoff',
        ownerLabel: `Janji "${p.title}" (payoff)`,
        missingTargetId: p.payoffCodexId,
        promiseId: p.id,
      });
    }
  }

  dangling.sort((a, b) => a.id.localeCompare(b.id));
  return dangling;
}
