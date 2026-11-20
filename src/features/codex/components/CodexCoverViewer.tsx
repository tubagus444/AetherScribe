import { useId, useLayoutEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { useCodexCover, useCoverUrl } from '@/src/features/codex/hooks/useCodexCover';

export function CodexCoverViewer({ codexId, name, onClose }: { codexId?: number; name: string; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const image = useCodexCover(codexId, 'cover');
  const url = useCoverUrl(image);

  useLayoutEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);

  return (
    <dialog
      ref={dialog}
      aria-labelledby={titleId}
      className="m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-5xl overflow-hidden rounded-xl bg-white p-0 text-slate-900 shadow-2xl backdrop:bg-slate-950/80 dark:bg-slate-900 dark:text-slate-100"
      onCancel={event => { event.preventDefault(); onClose(); }}
    >
      <div className="flex min-w-0 items-center justify-between gap-2 px-4 py-2">
        <h3 id={titleId} className="truncate text-sm font-semibold">Sampul {name}</h3>
        <button type="button" aria-label="Tutup sampul" className="shrink-0 rounded-lg p-2 hover:bg-slate-100 dark:hover:bg-slate-800" onClick={onClose}><X size={20} /></button>
      </div>
      <div className="grid min-h-24 place-items-center bg-slate-100 dark:bg-slate-950">
        {url ? (
          <img src={url} alt={`Sampul ${name}`} className="max-h-[calc(100dvh-6rem)] max-w-full object-contain" />
        ) : <p role="status" className="p-4 text-sm">{image === null ? 'Sampul tidak tersedia.' : 'Memuat sampul…'}</p>}
      </div>
    </dialog>
  );
}
