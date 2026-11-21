import React, { useEffect, useId, useState } from 'react';
import { cancelAI, suggestPlotClues } from '@/src/services/ai';
import type { PlotPromise } from '@/src/types';
import type { DetailChapterIndex } from '@/src/lib/codexDetails';
import type { QuickPromiseSeed } from './QuickPromiseModal';

interface Props {
  secret: string;
  entryId: number;
  projectId: number;
  promises: PlotPromise[];
  chapters: DetailChapterIndex;
  onChoose: (seed: QuickPromiseSeed) => void;
}

export function PlotClueIdeas({ secret, entryId, projectId, promises, chapters, onChoose }: Props) {
  const abortKey = 'plot-clues-' + useId();
  const [ideas, setIdeas] = useState<Awaited<ReturnType<typeof suggestPlotClues>>>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => () => cancelAI(abortKey), [abortKey]);
  const linked = promises.filter(p => p.projectId === projectId && p.payoffCodexId === entryId);

  async function generate() {
    setBusy(true);
    setIdeas([]);
    setError('');
    try {
      const clues = linked.map(p => {
        const chapter = p.plantedChapterId == null ? undefined : chapters.get(p.plantedChapterId);
        return { title: p.title, description: p.description, status: p.status, chapter: chapter && chapter.position + 1, keywords: p.keywords };
      });
      setIdeas(await suggestPlotClues(secret, clues, abortKey));
    } catch (cause) {
      if (!(cause instanceof Error && cause.name === 'AbortError')) setError('Saran belum tersedia. Periksa pengaturan AI atau coba lagi.');
    } finally {
      setBusy(false);
    }
  }

  return <div className="space-y-2 pt-2 text-sm">
    <p>AI akan memakai rahasia ini dan {linked.length} petunjuk terkait.</p>
    <button type="button" disabled={busy} onClick={generate} className="font-semibold text-indigo-600 disabled:opacity-50">
      {busy ? 'Memikirkan petunjuk…' : 'Bantu pikirkan petunjuk berikutnya'}
    </button>
    {error && <p role="alert">{error}</p>}
    {ideas.map((idea, index) => <div key={index} className="space-y-1 rounded-lg border p-3">
      <strong>{idea.title}</strong><p>{idea.description}</p>
      <button type="button" className="font-semibold text-indigo-600" onClick={() => onChoose({
        projectId, payoffCodexId: entryId, title: idea.title, description: idea.description,
        keywords: idea.keyword ? [idea.keyword] : [],
      })}>Tinjau dan catat</button>
    </div>)}
  </div>;
}
