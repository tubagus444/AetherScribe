import { useEffect, useState } from 'react';
import { Map as MapIcon } from 'lucide-react';
import { cn } from '@/src/lib/utils';

export function MapMiniThumbnail({ blob }: { blob?: Blob }) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!blob) {
      setUrl(null);
      return;
    }
    const u = URL.createObjectURL(blob);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [blob]);

  if (!url) {
    return (
      <div className="w-10 h-10 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center shrink-0 text-slate-400">
        <MapIcon size={16} />
      </div>
    );
  }

  return (
    <img
      src={url}
      alt="Thumbnail peta"
      className="w-10 h-10 rounded-lg object-cover border border-slate-200 dark:border-slate-700 shrink-0 bg-slate-900"
    />
  );
}

export function FilterGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="font-bold uppercase tracking-wider text-slate-400">{title}</span>
      <div className="flex flex-wrap gap-1">{children}</div>
    </div>
  );
}

export function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={cn('px-2 py-0.5 rounded-md border',
        active
          ? 'bg-indigo-100 dark:bg-indigo-900/40 border-indigo-200 dark:border-indigo-800 text-indigo-700 dark:text-indigo-300'
          : 'bg-transparent border-slate-200 dark:border-slate-700 text-slate-400 line-through')}
    >
      {children}
    </button>
  );
}
