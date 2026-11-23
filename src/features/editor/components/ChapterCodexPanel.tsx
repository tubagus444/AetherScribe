import { useEffect, useMemo, useRef, useState } from 'react';
import type { Editor } from '@tiptap/core';
import { ArrowLeft, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { ChapterCodexEntryDetails } from '@/src/features/editor/components/ChapterCodexEntryDetails';
import { setChapterCodexHighlights } from '@/src/features/editor/extensions/PassiveCodexHighlight';
import type { CategoryDef } from '@/src/lib/codexCategories';
import { cn } from '@/src/lib/utils';
import { getCodexMatches } from '@/src/services/contextEngine';
import type { CodexEntry } from '@/src/types';

type Match = Awaited<ReturnType<typeof getCodexMatches>>[number];
type Occurrence = Pick<Match, 'start' | 'end'> & { excerpt: string; ids: Set<number>; isMention: boolean };
type Scan = { doc: Editor['state']['doc']; occurrences: Occurrence[] };
const noOccurrences: readonly Occurrence[] = [];
const smallButton = 'rounded-md px-2 py-1.5 font-medium text-indigo-700 hover:bg-indigo-50 disabled:opacity-40 dark:text-indigo-300 dark:hover:bg-indigo-950';

interface ChapterCodexPanelProps {
  editor: Editor;
  entries: CodexEntry[];
  categories: CategoryDef[];
  showingText: boolean;
  onJump: () => void;
  onViewText: () => void;
  onShowDetails: () => void;
}

export function ChapterCodexPanel({ editor, entries, categories, showingText, onJump, onViewText, onShowDetails }: ChapterCodexPanelProps) {
  const [scan, setScan] = useState<Scan>();
  const [failed, setFailed] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [occurrenceIndex, setOccurrenceIndex] = useState(0);
  const panelRef = useRef<HTMLElement>(null);
  const detailHeadingRef = useRef<HTMLHeadingElement>(null);
  const listHeadingRef = useRef<HTMLHeadingElement>(null);
  const restoreDetailsRef = useRef<HTMLButtonElement>(null);
  const visibleEntries = useMemo(() => entries.filter(entry => !entry.hidden), [entries]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    let generation = 0;
    function schedule() {
      clearTimeout(timer);
      const run = ++generation;
      const doc = editor.state.doc;
      setScan(undefined);
      setFailed(false);
      timer = setTimeout(async () => {
        const chunks: { pos: number; text: string }[] = [];
        const mentions: { start: number; end: number; text: string }[] = [];
        doc.descendants((node, pos) => {
          if (node.isText && node.text) {
            const previous = chunks.at(-1);
            if (previous && previous.pos + previous.text.length === pos) previous.text += node.text;
            else chunks.push({ pos, text: node.text });
          }
          if (node.type.name === 'mention') {
            const text = node.attrs.label ?? node.attrs.id;
            if (typeof text === 'string') mentions.push({ start: pos, end: pos + node.nodeSize, text });
          }
        });
        // A mention occupies one document position even if its label spans several characters.
        // Give labels their own worker offsets and map them back to the original node.
        const mentionOffsets = new Map<number, (typeof mentions)[number]>();
        let nextOffset = doc.content.size + 1;
        for (const mention of mentions) {
          mentionOffsets.set(nextOffset, mention);
          chunks.push({ pos: nextOffset, text: mention.text });
          nextOffset += mention.text.length + 1;
        }
        try {
          const matches = await getCodexMatches(chunks, visibleEntries, true);
          if (run !== generation || editor.isDestroyed || editor.state.doc !== doc) return;
          const ranges = new Map<string, Occurrence>();
          let chunkIndex = 0;
          for (const match of matches) {
            while (chunks[chunkIndex + 1]?.pos <= match.start) chunkIndex++;
            const mention = mentionOffsets.get(chunks[chunkIndex].pos);
            const start = mention?.start ?? match.start;
            const end = mention?.end ?? match.end;
            const key = `${start}:${end}`;
            let occurrence = ranges.get(key);
            if (!occurrence) {
              const excerpt = mention?.text ?? doc.textBetween(start, end);
              occurrence = { start, end, excerpt, ids: new Set(), isMention: !!mention };
              ranges.set(key, occurrence);
            }
            occurrence.ids.add(match.codexId);
          }
          setScan({ doc, occurrences: [...ranges.values()].sort((a, b) => a.start - b.start) });
        } catch {
          if (run === generation) setFailed(true);
        }
      }, 300);
    }

    function onTransaction({ transaction }: { transaction: { docChanged: boolean } }) {
      if (transaction.docChanged) schedule();
    }

    schedule();
    editor.on('transaction', onTransaction);
    return () => {
      generation++;
      clearTimeout(timer);
      editor.off('transaction', onTransaction);
    };
  }, [editor, visibleEntries]);

  const entriesById = useMemo(() => new Map(visibleEntries.map(entry => [entry.id, entry])), [visibleEntries]);
  const { byEntity, ambiguous } = useMemo(() => {
    const byEntity = new Map<number, Occurrence[]>();
    const ambiguous: Occurrence[] = [];
    for (const occurrence of scan?.occurrences ?? []) {
      if (occurrence.ids.size > 1) {
        ambiguous.push(occurrence);
        continue;
      }
      for (const id of occurrence.ids) {
        const existing = byEntity.get(id);
        if (existing) existing.push(occurrence);
        else byEntity.set(id, [occurrence]);
      }
    }
    return { byEntity, ambiguous };
  }, [scan]);

  const entry = selectedId === null ? undefined : entriesById.get(selectedId);
  const hasEntry = entry !== undefined;
  const matches = entry?.id == null ? noOccurrences : byEntity.get(entry.id) ?? noOccurrences;
  const currentIndex = Math.min(occurrenceIndex, matches.length - 1);

  useEffect(() => {
    setChapterCodexHighlights(editor, scan?.doc === editor.state.doc ? matches : noOccurrences);
  }, [editor, matches, scan]);

  useEffect(() => () => setChapterCodexHighlights(editor, noOccurrences), [editor]);

  useEffect(() => {
    if (selectedId === null) return;
    if (!hasEntry) {
      setSelectedId(null);
      onShowDetails();
      return;
    }
    panelRef.current?.scrollTo({ top: 0 });
    const heading = showingText ? restoreDetailsRef.current : detailHeadingRef.current;
    heading?.focus({ preventScroll: true });
  }, [selectedId, hasEntry, showingText, onShowDetails]);

  function openDetails(id: number) {
    setSelectedId(id);
    setOccurrenceIndex(0);
  }

  function backToList() {
    setSelectedId(null);
    onShowDetails();
    listHeadingRef.current?.focus({ preventScroll: true });
  }

  function viewOccurrence(index: number) {
    const match = matches[index];
    if (!match || scan?.doc !== editor.state.doc) return;
    setOccurrenceIndex(index);
    const element = editor.view.dom.querySelector(`[data-chapter-codex-start="${match.start}"]`);
    element?.scrollIntoView({ block: 'center', inline: 'nearest' });
    onViewText();
  }

  function jumpTo({ start, end }: Occurrence) {
    if (scan?.doc !== editor.state.doc) return;
    editor.chain().focus().setTextSelection({ from: start, to: end }).scrollIntoView().run();
    onJump();
  }

  return (
    <section ref={panelRef} className={cn('min-h-0 flex-1 overflow-y-auto p-4 text-sm', showingText && 'max-lg:p-2')}>
      <h2 ref={listHeadingRef} tabIndex={-1} className={cn('mb-3 text-base font-semibold', entry && 'sr-only')}>Codex di Bab Ini</h2>
      {entry ? (
        <>
          <div className={cn('mb-3 space-y-2', showingText && 'max-lg:hidden')}>
            <button type="button" onClick={backToList} className={cn(smallButton, 'inline-flex items-center gap-1')}>
              <ArrowLeft size={14} /> Kembali ke daftar
            </button>
            <h3 ref={detailHeadingRef} tabIndex={-1} className="break-words text-lg font-semibold">{entry.name}</h3>
          </div>
          {showingText && (
            <div className="flex items-center justify-between gap-2 lg:hidden">
              <button ref={restoreDetailsRef} type="button" aria-label={`Lihat detail ${entry.name}`} onClick={onShowDetails} className={cn(smallButton, 'min-w-0 truncate')}>
                {entry.name} · Detail
              </button>
              <button type="button" aria-label="Hapus sorotan Codex" onClick={backToList} className={smallButton}><X size={16} /></button>
            </div>
          )}
          <div className={cn('mb-4 flex flex-wrap items-center justify-between gap-1 rounded-lg border border-teal-200 bg-teal-50 px-2 py-1 dark:border-teal-900 dark:bg-teal-950/40', showingText && 'max-lg:mb-0')}>
            <span role="status" className="px-1 text-xs font-medium text-teal-900 dark:text-teal-100">
              {failed ? 'Pemindaian gagal.' : !scan ? 'Memindai penyebutan…' : matches.length ? `${currentIndex + 1} dari ${matches.length} penyebutan` : 'Tidak ada penyebutan yang pasti.'}
            </span>
            {matches.length > 0 && (
              <div className="flex items-center gap-1">
                <button type="button" onClick={() => viewOccurrence(currentIndex - 1)} disabled={currentIndex <= 0} aria-label="Penyebutan sebelumnya" className={smallButton}><ChevronLeft size={16} /></button>
                <button type="button" onClick={() => viewOccurrence(currentIndex)} className={smallButton}>Lihat di naskah</button>
                <button type="button" onClick={() => viewOccurrence(currentIndex + 1)} disabled={currentIndex === matches.length - 1} aria-label="Penyebutan berikutnya" className={smallButton}><ChevronRight size={16} /></button>
              </div>
            )}
          </div>
          <div className={showingText ? 'max-lg:hidden' : undefined}>
            <ChapterCodexEntryDetails entry={entry} categories={categories} />
          </div>
        </>
      ) : (
        <>
          {failed && <p role="alert">Penyebutan Codex gagal dipindai.</p>}
          {!failed && !scan && <p role="status">Memindai penyebutan…</p>}
          {scan?.occurrences.length === 0 && <p>Belum ada entitas Codex yang terdeteksi di bab ini.</p>}
          <ul className="space-y-2">
            {[...byEntity].map(([id, matches]) => (
              <li key={id} className="rounded-md border border-slate-200 p-2 dark:border-slate-700">
                <button type="button" className="block text-left font-semibold hover:underline" onClick={() => openDetails(id)}>{entriesById.get(id)?.name}</button>
                <button type="button" className="text-left text-xs text-slate-600 hover:underline dark:text-slate-300" onClick={() => jumpTo(matches[0])}>
                  “{matches[0].excerpt}” · {matches.length} penyebutan
                </button>
              </li>
            ))}
          </ul>
          {ambiguous.length > 0 && (
            <div className="mt-4">
              <h3 className="mb-2 font-semibold">Penyebutan ambigu</h3>
              <ul className="space-y-2">
                {ambiguous.map(match => (
                  <li key={match.start} className="rounded-md border border-slate-200 p-2 dark:border-slate-700">
                    <button type="button" className="font-medium hover:underline" onClick={() => jumpTo(match)}>“{match.excerpt}”</button>
                    <ul>
                      {[...match.ids].map(id => (
                        <li key={id}><button type="button" className="text-left text-xs hover:underline" onClick={() => openDetails(id)}>{entriesById.get(id)?.name}</button></li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </section>
  );
}
