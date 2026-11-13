import { useToast } from '@/src/hooks/useToast';
import { readBackupSnapshot } from '@/src/services/backupSnapshot';
/**
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import { jsPDF } from 'jspdf';
import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType } from 'docx';
import { saveAs } from 'file-saver';
import { FileDown, FileText, Globe, Loader2, CheckCircle2, X, FileEdit, BookOpen, CheckSquare, Square } from 'lucide-react';
import { motion } from 'motion/react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/src/db';
import { Project, Chapter } from '@/src/types';
import { htmlToMarkdown, stripRevisionComments } from '@/src/lib/editorUtils';
import { countWords } from '@/src/lib/utils';
import { buildEpub } from '@/src/lib/epub';

interface ExportManagerProps {
  projectId: number;
  project: Project | undefined;
  onClose: () => void;
}

type ExportFormat = 'md' | 'pdf' | 'docx' | 'epub';
type ExportStatus = 'idle' | 'processing' | 'success';

interface Run { text: string; bold: boolean; italic: boolean; }

// ── Helper konversi konten ─────────────────────────────────────────────────────

/** Pecah elemen blok menjadi run bergaya (tebal/miring) untuk render PDF. */
function extractRuns(el: Element): Run[] {
  const runs: Run[] = [];
  const walk = (node: Node, bold: boolean, italic: boolean) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const t = node.textContent || '';
      if (t) runs.push({ text: t, bold, italic });
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      const e = node as HTMLElement;
      const b = bold || e.tagName === 'STRONG' || e.tagName === 'B';
      const i = italic || e.tagName === 'EM' || e.tagName === 'I';
      e.childNodes.forEach(c => walk(c, b, i));
    }
  };
  el.childNodes.forEach(c => walk(c, false, false));
  return runs;
}

/** Konversi HTML bab → badan XHTML well-formed (untuk EPUB). */
function htmlToXhtmlBody(html: string): string {
  const doc = new DOMParser().parseFromString(html || '', 'text/html');
  // Hapus elemen <img> karena EPUB butuh gambar terdaftar di manifest;
  // tanpa ekstensi sinkron, tag ini akan membuat EPUB invalid.
  doc.querySelectorAll('img').forEach(img => img.remove());
  const serialized = new XMLSerializer().serializeToString(doc.body);
  // Buang pembungkus <body ...> ... </body> → sisakan isi (XHTML, tag void self-closing).
  const inner = serialized.replace(/^<body[^>]*>/, '').replace(/<\/body>\s*$/, '').trim();
  return inner || '<p></p>';
}

function makeUuid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

/** Kembalikan kendali ke event loop agar React sempat mengecat (spinner) & UI tak beku. */
const yieldToUI = () => new Promise<void>((r) => setTimeout(r, 0));

export function ExportManager({ projectId, project, onClose }: ExportManagerProps) {
  const { toast } = useToast();
  const [status, setStatus] = useState<ExportStatus>('idle');
  const [format, setFormat] = useState<ExportFormat>('md');
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [initialized, setInitialized] = useState(false);

  const chapters = useLiveQuery(
    () => db.chapters.where('projectId').equals(projectId).sortBy('order'),
    [projectId],
  );

  // Default: pilih semua bab saat daftar pertama kali termuat.
  useEffect(() => {
    if (chapters && !initialized) {
      setSelectedIds(new Set(chapters.map(c => c.id!)));
      setInitialized(true);
    }
  }, [chapters, initialized]);

  const selectedChapters = useMemo(
    () => (chapters || []).filter(c => selectedIds.has(c.id!)),
    [chapters, selectedIds],
  );

  const selectedWords = useMemo(
    () => selectedChapters.reduce((sum, c) => sum + countWords(c.content), 0),
    [selectedChapters],
  );

  const allSelected = !!chapters && chapters.length > 0 && selectedIds.size === chapters.length;

  const toggleChapter = (id: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (!chapters) return;
    setSelectedIds(allSelected ? new Set() : new Set(chapters.map(c => c.id!)));
  };

  // ── Eksportir ────────────────────────────────────────────────────────────────

  const exportMarkdown = (list: Chapter[], exportProject = project) => {
    let content = `# ${exportProject?.name || 'Untitled Project'}\n\n`;
    list.forEach(ch => {
      content += `## ${ch.title}\n\n${htmlToMarkdown(ch.content)}\n\n`;
    });
    saveAs(new Blob([content], { type: 'text/markdown' }), `${exportProject?.name || 'Manuscript'}.md`);
  };

  const exportPDF = async (list: Chapter[], exportProject = project) => {
    const doc = new jsPDF();
    const pageHeight = doc.internal.pageSize.height;
    const pageWidth = doc.internal.pageSize.width;
    const margin = 25.4; // 1 inci
    const innerWidth = pageWidth - margin * 2;
    const lineHeight = 7;
    let y = margin;

    doc.setFont('times', 'normal');

    // Halaman judul sederhana
    doc.setFontSize(24);
    doc.text(exportProject?.name || 'Manuscript', pageWidth / 2, y + 40, { align: 'center' });
    doc.setFontSize(14);
    doc.text('A Novel Manuscript', pageWidth / 2, y + 55, { align: 'center' });
    doc.addPage();
    y = margin;

    const styleFor = (b: boolean, i: boolean) => (b && i ? 'bolditalic' : b ? 'bold' : i ? 'italic' : 'normal');

    // Render paragraf dengan run bergaya (mempertahankan tebal/miring inline).
    const renderRuns = (runs: Run[]) => {
      let x = margin;
      doc.setFontSize(11);
      runs.forEach(run => {
        doc.setFont('times', styleFor(run.bold, run.italic));
        const tokens = run.text.split(/(\s+)/);
        for (const token of tokens) {
          if (!token) continue;
          const w = doc.getTextWidth(token);
          if (token.trim() === '') {
            x += w; // spasi: cukup majukan kursor
            continue;
          }
          if (x + w > margin + innerWidth) {
            x = margin;
            y += lineHeight;
            if (y > pageHeight - margin) { doc.addPage(); y = margin; }
          }
          doc.text(token, x, y);
          x += w;
        }
      });
      y += lineHeight + 4; // jarak antar paragraf
    };

    for (let index = 0; index < list.length; index++) {
      const ch = list[index];
      if (y > pageHeight - 40) { doc.addPage(); y = margin; }

      doc.setFontSize(18);
      doc.setFont('times', 'bold');
      doc.text(ch.title || `Chapter ${index + 1}`, margin, y);
      y += 12;

      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = ch.content || '';
      const blocks = Array.from(tempDiv.querySelectorAll('p, h1, h2, h3, h4, h5, h6'));
      const nodes = blocks.length > 0 ? blocks : [tempDiv];

      nodes.forEach((node) => {
        const runs = extractRuns(node);
        if (runs.length === 0) return;
        if (y > pageHeight - margin) { doc.addPage(); y = margin; }
        renderRuns(runs);
      });

      y += 10; // jarak antar bab
      // Yield tiap beberapa bab: getTextWidth per-token mahal → tanpa ini UI beku
      // multi-detik pada naskah 100+ bab (spinner pun tak sempat tampil).
      if ((index & 7) === 7) await yieldToUI();
    }

    doc.save(`${exportProject?.name || 'Manuscript'}.pdf`);
  };

  const htmlToDocxElements = (html: string): Paragraph[] => {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    const elements: Paragraph[] = [];

    const processNode = (node: Node, styles: { bold?: boolean; italics?: boolean } = {}): TextRun[] => {
      let runs: TextRun[] = [];
      if (node.nodeType === Node.TEXT_NODE) {
        if (node.textContent) {
          runs.push(new TextRun({ text: node.textContent, bold: styles.bold, italics: styles.italics, size: 24, font: 'Times New Roman' }));
        }
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        const el = node as HTMLElement;
        const nextStyles = { ...styles };
        if (el.tagName === 'STRONG' || el.tagName === 'B') nextStyles.bold = true;
        if (el.tagName === 'EM' || el.tagName === 'I') nextStyles.italics = true;
        el.childNodes.forEach(child => { runs = runs.concat(processNode(child, nextStyles)); });
      }
      return runs;
    };

    const runsOfChildren = (el: HTMLElement, styles: { bold?: boolean; italics?: boolean } = {}): TextRun[] => {
      const runs: TextRun[] = [];
      el.childNodes.forEach(child => { runs.push(...processNode(child, styles)); });
      return runs;
    };

    // Konversi satu elemen BLOK → daftar Paragraph. Rekursif agar `<ul>/<ol>/<blockquote>`
    // TIDAK diratakan jadi satu paragraf (bug lama: semua `<li>` menyatu). TipTap
    // membungkus isi item di `<p>`, jadi `<li>` bisa memuat `<p>` dan/atau sub-list.
    const blockToParagraphs = (el: HTMLElement, depth = 0): Paragraph[] => {
      const tag = el.tagName;

      if (tag === 'P') {
        const children = runsOfChildren(el);
        return children.length ? [new Paragraph({ children, spacing: { after: 200, line: 360 }, alignment: AlignmentType.JUSTIFIED })] : [];
      }

      if (/^H[1-6]$/.test(tag)) {
        const level = parseInt(tag.substring(1));
        const headingMap: Record<number, any> = { 1: HeadingLevel.HEADING_1, 2: HeadingLevel.HEADING_2, 3: HeadingLevel.HEADING_3 };
        return [new Paragraph({ children: runsOfChildren(el), heading: headingMap[level] || HeadingLevel.HEADING_1, spacing: { before: 400, after: 200 } })];
      }

      if (tag === 'UL' || tag === 'OL') {
        const paras: Paragraph[] = [];
        let n = 1;
        Array.from(el.children).forEach((li) => {
          if (li.tagName !== 'LI') return;
          // Pisahkan run inline item dari sub-list (yang diproses rekursif berindent).
          const inline: TextRun[] = [];
          const nested: HTMLElement[] = [];
          li.childNodes.forEach((child) => {
            const c = child as HTMLElement;
            if (child.nodeType === Node.ELEMENT_NODE && (c.tagName === 'UL' || c.tagName === 'OL')) nested.push(c);
            else inline.push(...processNode(child));
          });
          if (inline.length) {
            if (tag === 'OL') {
              // Nomor manual (hindari konfigurasi numbering docx); indent per kedalaman.
              paras.push(new Paragraph({ children: [new TextRun({ text: `${n}. `, size: 24, font: 'Times New Roman' }), ...inline], indent: { left: 720 * (depth + 1) }, spacing: { after: 120 } }));
            } else {
              paras.push(new Paragraph({ children: inline, bullet: { level: depth }, spacing: { after: 120 } }));
            }
          }
          n++;
          nested.forEach((nl) => paras.push(...blockToParagraphs(nl, depth + 1)));
        });
        return paras;
      }

      if (tag === 'BLOCKQUOTE') {
        // Satu paragraf per blok-anak (atau seluruh isi), indentasi + miring.
        const blocks = Array.from(el.children).filter((c) => c.nodeType === Node.ELEMENT_NODE) as HTMLElement[];
        const targets = blocks.length ? blocks : [el];
        const paras: Paragraph[] = [];
        targets.forEach((t) => {
          const runs = runsOfChildren(t, { italics: true });
          if (runs.length) paras.push(new Paragraph({ children: runs, indent: { left: 720 }, spacing: { after: 200 } }));
        });
        return paras;
      }

      // Blok lain dengan isi teks → satu paragraf biasa.
      const children = runsOfChildren(el);
      return children.length ? [new Paragraph({ children, spacing: { after: 200 } })] : [];
    };

    doc.body.childNodes.forEach(node => {
      if (node.nodeType === Node.ELEMENT_NODE) {
        elements.push(...blockToParagraphs(node as HTMLElement));
      } else if (node.nodeType === Node.TEXT_NODE && node.textContent?.trim()) {
        elements.push(new Paragraph({ children: [new TextRun({ text: node.textContent, size: 24, font: 'Times New Roman' })], spacing: { after: 200 } }));
      }
    });

    return elements;
  };

  const exportDocx = async (list: Chapter[], exportProject = project) => {
    const sections: Paragraph[] = [];
    for (let i = 0; i < list.length; i++) {
      const ch = list[i];
      sections.push(new Paragraph({ text: ch.title, heading: HeadingLevel.HEADING_1, alignment: AlignmentType.CENTER, spacing: { before: 400, after: 400 } }));
      sections.push(...htmlToDocxElements(ch.content || ''));
      if ((i & 7) === 7) await yieldToUI(); // DOMParser per bab → yield agar UI tak beku
    }

    const doc = new Document({
      title: exportProject?.name,
      sections: [{ properties: { page: { margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } } }, children: sections }],
    });

    const buffer = await Packer.toBlob(doc);
    saveAs(buffer, `${exportProject?.name || 'Manuscript'}.docx`);
  };

  const exportEpub = (list: Chapter[], exportProject = project) => {
    const bytes = buildEpub({
      title: exportProject?.name || 'Manuscript',
      identifier: makeUuid(),
      language: 'id',
      chapters: list.map((ch, i) => ({
        title: ch.title || `Bab ${i + 1}`,
        xhtmlBody: htmlToXhtmlBody(ch.content || ''),
      })),
    });
    saveAs(new Blob([bytes], { type: 'application/epub+zip' }), `${exportProject?.name || 'Manuscript'}.epub`);
  };

  const handleExport = async () => {
    if (selectedChapters.length === 0) return;
    setStatus('processing');
    try {
      // Beri React satu tick untuk mengecat overlay "processing" SEBELUM kerja berat
      // sinkron (jsPDF/DOMParser) memblokir main thread — kalau tidak, spinner tak
      // pernah tampil & UI beku pada naskah besar.
      await yieldToUI();
      // Lepas mark catatan revisi dari konten sebelum konversi format apa pun agar
      // catatan pribadi penulis tidak ikut terbawa ke berkas hasil ekspor.
      const snapshot = await readBackupSnapshot(projectId);
      const freshChapters = (snapshot.chapters as Chapter[]).filter(c => selectedIds.has(c.id!)).sort((a, b) => a.order - b.order || a.id! - b.id!);
      const cleaned = freshChapters.map(c => ({ ...c, content: stripRevisionComments(c.content || '') }));
      switch (format) {
        case 'md': exportMarkdown(cleaned, snapshot.projects[0]); break;
        case 'pdf': await exportPDF(cleaned, snapshot.projects[0]); break;
        case 'docx': await exportDocx(cleaned, snapshot.projects[0]); break;
        case 'epub': exportEpub(cleaned, snapshot.projects[0]); break;
      }
      setStatus('success');
      setTimeout(() => { setStatus('idle'); onClose(); }, 2000);
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : 'Ekspor gagal.');
      setStatus('idle');
    }
  };

  const formatOptions: { id: ExportFormat; label: string; icon: typeof FileText; color: string }[] = [
    { id: 'md', label: 'Markdown', icon: FileEdit, color: 'text-indigo-600 bg-indigo-50 dark:bg-indigo-900/20' },
    { id: 'pdf', label: 'PDF', icon: FileText, color: 'text-red-600 bg-red-50 dark:bg-red-900/20' },
    { id: 'docx', label: 'Word', icon: Globe, color: 'text-blue-600 bg-blue-50 dark:bg-blue-900/20' },
    { id: 'epub', label: 'EPUB', icon: BookOpen, color: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-900/20' },
  ];

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md">
      <motion.div
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="bg-white dark:bg-slate-900 w-full max-w-md rounded-2xl shadow-3xl overflow-hidden border border-slate-200 dark:border-slate-800 flex flex-col max-h-[90vh]"
      >
        <header className="p-6 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between flex-none">
          <div>
            <h2 className="text-lg font-bold text-slate-800 dark:text-slate-200">Ekspor Naskah</h2>
            <p className="text-xs text-slate-400 dark:text-slate-500">Siapkan cerita Anda untuk dunia.</p>
          </div>
          <button type="button" onClick={onClose} className="p-2 hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-800 rounded-full text-slate-400 dark:text-slate-500" title="Tutup">
            <X size={18} />
          </button>
        </header>

        <div className="p-6 space-y-6 overflow-y-auto custom-scrollbar">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {formatOptions.map((f) => (
              <button
                type="button"
                key={f.id}
                onClick={() => setFormat(f.id)}
                className={`flex flex-col items-center justify-center gap-2 p-3 rounded-xl border transition-all ${
                  format === f.id
                    ? 'border-indigo-500 ring-4 ring-indigo-50 dark:ring-indigo-900/10 bg-white dark:bg-slate-800'
                    : 'border-slate-100 dark:border-slate-800 hover:border-slate-200 dark:hover:border-slate-700 opacity-60'
                }`}
              >
                <div className={`p-2 rounded-lg ${f.color}`}>
                  <f.icon size={18} />
                </div>
                <span className="text-[10px] font-bold uppercase tracking-wider dark:text-slate-300">{f.label}</span>
              </button>
            ))}
          </div>

          {/* Pemilihan bab */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">Bab yang Diekspor</h3>
              <button type="button" onClick={toggleAll} className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1">
                {allSelected ? <Square size={12} /> : <CheckSquare size={12} />}
                {allSelected ? 'Kosongkan' : 'Pilih Semua'}
              </button>
            </div>
            <div className="max-h-44 overflow-y-auto custom-scrollbar rounded-xl border border-slate-100 dark:border-slate-800 divide-y divide-slate-50 dark:divide-slate-800/50">
              {!chapters && (
                <div className="p-4 text-center text-xs text-slate-400"><Loader2 size={16} className="animate-spin mx-auto" /></div>
              )}
              {chapters && chapters.length === 0 && (
                <div className="p-4 text-center text-xs text-slate-400 italic">Belum ada bab.</div>
              )}
              {chapters?.map((ch) => {
                const checked = selectedIds.has(ch.id!);
                return (
                  <button
                    type="button"
                    key={ch.id}
                    onClick={() => toggleChapter(ch.id!)}
                    className="w-full flex items-center gap-3 p-2.5 text-left hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors"
                  >
                    {checked
                      ? <CheckSquare size={16} className="text-indigo-600 shrink-0" />
                      : <Square size={16} className="text-slate-300 dark:text-slate-600 shrink-0" />}
                    <span className={`text-sm truncate flex-1 ${checked ? 'text-slate-700 dark:text-slate-200' : 'text-slate-400 dark:text-slate-500'}`}>
                      {ch.title || 'Tanpa Judul'}
                    </span>
                    <span className="text-[10px] text-slate-400 shrink-0">{countWords(ch.content).toLocaleString()}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-4 border border-slate-100 dark:border-slate-800">
            <h3 className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-2">Ringkasan Ekspor</h3>
            <div className="space-y-1 text-xs text-slate-600 dark:text-slate-400">
              <div className="flex justify-between">
                <span>Bab Dipilih:</span>
                <span className="font-bold text-slate-800 dark:text-slate-200">{selectedChapters.length} / {chapters?.length ?? 0}</span>
              </div>
              <div className="flex justify-between">
                <span>Total Kata:</span>
                <span className="font-bold text-slate-800 dark:text-slate-200">{selectedWords.toLocaleString()}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="p-6 pt-0 flex-none">
          <button
            type="button"
            disabled={status !== 'idle' || selectedChapters.length === 0}
            onClick={handleExport}
            className={`w-full py-4 rounded-xl flex items-center justify-center gap-3 text-sm font-bold transition-all shadow-lg ${
              status === 'success' ? 'bg-emerald-500 text-white' : 'bg-indigo-600 hover:bg-indigo-700 text-white disabled:opacity-50 disabled:pointer-events-none'
            }`}
          >
            {status === 'idle' && (<><FileDown size={18} />Buat Ekspor {format.toUpperCase()}</>)}
            {status === 'processing' && (<><Loader2 size={18} className="animate-spin" />Diseduh naskahnya...</>)}
            {status === 'success' && (<><CheckCircle2 size={18} />Ekspor Selesai!</>)}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
