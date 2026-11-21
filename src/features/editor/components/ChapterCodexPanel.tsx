import { useEffect, useState } from 'react';
import type { Editor } from '@tiptap/core';
import { useNavigation } from '@/src/contexts/NavigationContext';
import { getCodexMatches } from '@/src/services/contextEngine';
import type { CodexEntry } from '@/src/types';

type Match = Awaited<ReturnType<typeof getCodexMatches>>[number];
type Occurrence = Pick<Match, 'start' | 'end'> & { excerpt: string; ids: Set<number> };

export function ChapterCodexPanel({ editor, entries, onJump }: { editor: Editor; entries: CodexEntry[]; onJump: () => void }) {
  const { openCodexEntry } = useNavigation();
  const [occurrences, setOccurrences] = useState<Occurrence[]>();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    let generation = 0;
    const visibleEntries = entries.filter(entry => !entry.hidden);
    function schedule() {
      clearTimeout(timer);
      const run = ++generation;
      const doc = editor.state.doc;
      setOccurrences(undefined);
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
              occurrence = { start, end, excerpt, ids: new Set() };
              ranges.set(key, occurrence);
            }
            occurrence.ids.add(match.codexId);
          }
          setOccurrences([...ranges.values()].sort((a, b) => a.start - b.start));
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
  }, [editor, entries]);

  const entryNames = new Map(entries.filter(entry => !entry.hidden).map(entry => [entry.id, entry.name]));
  const byEntity = new Map<number, Occurrence[]>();
  const ambiguous: Occurrence[] = [];
  for (const occurrence of occurrences ?? []) {
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

  function jumpTo({ start, end }: Occurrence) {
    editor.chain().focus().setTextSelection({ from: start, to: end }).scrollIntoView().run();
    onJump();
  }

  return (
    <section className="min-h-0 flex-1 overflow-y-auto p-4 text-sm">
      <h2 className="mb-3 text-base font-semibold">Codex di Bab Ini</h2>
      {failed && <p role="alert">Penyebutan Codex gagal dipindai.</p>}
      {!failed && !occurrences && <p role="status">Memindai penyebutan…</p>}
      {occurrences?.length === 0 && <p>Belum ada entitas Codex yang terdeteksi di bab ini.</p>}
      <ul className="space-y-2">
        {[...byEntity].map(([id, matches]) => (
          <li key={id} className="rounded-md border border-slate-200 p-2 dark:border-slate-700">
            <button type="button" className="block text-left font-semibold hover:underline" onClick={() => openCodexEntry(id)}>{entryNames.get(id)}</button>
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
                  {[...match.ids].map(id => <li key={id}><button type="button" className="text-left text-xs hover:underline" onClick={() => openCodexEntry(id)}>{entryNames.get(id)}</button></li>)}
                </ul>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
