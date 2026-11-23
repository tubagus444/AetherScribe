import { useId, useMemo, useRef, useState } from 'react';
import { Search } from 'lucide-react';
import { getCategoryLabel, type CategoryDef } from '@/src/lib/codexCategories';
import type { CodexEntry } from '@/src/types';

interface LoreGraphSearchProps {
  entries: CodexEntry[];
  categories: CategoryDef[];
  visibleIds: ReadonlySet<number>;
  disabled: boolean;
  onLocate: (id: number) => void;
}

const RESULTS_PER_PAGE = 8;

function normalizeSearch(text: string) {
  return text.normalize('NFD').replace(/\p{M}/gu, '').trim().toLowerCase();
}

export function LoreGraphSearch({ entries, categories, visibleIds, disabled, onLocate }: LoreGraphSearchProps) {
  const listId = useId();
  const input = useRef<HTMLInputElement>(null);
  const firstResult = useRef<HTMLButtonElement>(null);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [resultLimit, setResultLimit] = useState(RESULTS_PER_PAGE);
  const normalizedQuery = normalizeSearch(query);
  const index = useMemo(() => entries.flatMap(entry => entry.id == null ? [] : [{
    id: entry.id,
    name: entry.name,
    category: getCategoryLabel(entry.category, categories),
    normalizedName: normalizeSearch(entry.name),
    aliases: (entry.aliases ?? []).map(alias => ({ label: alias, normalized: normalizeSearch(alias) })),
  }]), [entries, categories]);

  const results = useMemo(() => {
    if (!normalizedQuery || !open) return [];
    return index.flatMap(entry => {
      const { normalizedName, aliases } = entry;
      const alias = aliases.find(a => a.normalized === normalizedQuery)
        ?? aliases.find(a => a.normalized.includes(normalizedQuery));
      const rank = normalizedName === normalizedQuery ? 0
        : alias?.normalized === normalizedQuery ? 1
        : normalizedName.startsWith(normalizedQuery) ? 2
        : normalizedName.includes(normalizedQuery) ? 3
        : alias ? 4 : null;
      return rank === null ? [] : [{ ...entry, alias: alias?.label, rank }];
    }).sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name, 'id') || a.id - b.id);
  }, [index, normalizedQuery, open]);
  const showResults = open && !!normalizedQuery;
  const select = (id: number) => {
    input.current?.focus();
    setQuery('');
    setOpen(false);
    onLocate(id);
  };

  return (
    <div
      className="relative z-40 w-full sm:max-w-xs"
      onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false); }}
      onKeyDown={event => {
        if (event.key !== 'Escape' || !showResults) return;
        event.preventDefault();
        input.current?.focus();
        setOpen(false);
      }}
    >
      <Search aria-hidden size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
      <input
        ref={input}
        type="search"
        aria-label="Cari node"
        aria-controls={showResults ? listId : undefined}
        placeholder="Cari node menurut nama atau alias"
        autoComplete="off"
        disabled={disabled}
        value={query}
        onFocus={() => setOpen(true)}
        onChange={event => {
          setQuery(event.target.value);
          setResultLimit(RESULTS_PER_PAGE);
          setOpen(true);
        }}
        onKeyDown={event => {
          if (event.nativeEvent.isComposing) return;
          if (event.key === 'ArrowDown' && results.length) {
            event.preventDefault();
            firstResult.current?.focus();
          }
          if (event.key === 'Enter' && results.length) {
            event.preventDefault();
            select(results[0].id);
          }
        }}
        className="w-full rounded-xl border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm text-slate-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
      />
      {showResults && (
        <div id={listId} className="absolute inset-x-0 top-full mt-1 max-h-[min(18rem,40dvh)] overflow-y-auto overscroll-contain rounded-xl border border-slate-200 bg-white p-1 shadow-xl dark:border-slate-700 dark:bg-slate-900">
          {results.length === 0 && <p role="status" className="px-3 py-2 text-sm text-slate-500 dark:text-slate-400">Tidak ada node yang cocok.</p>}
          {results.length > 0 && (
            <ul aria-label="Hasil pencarian node">
              {results.slice(0, resultLimit).map(({ id, name, category, alias }, position) => (
                <li key={id}>
                  <button
                    type="button"
                    ref={position === 0 ? firstResult : undefined}
                    onMouseDown={event => event.preventDefault()}
                    onClick={() => select(id)}
                    className="flex w-full flex-wrap items-baseline justify-between gap-x-3 gap-y-1 rounded-lg px-3 py-2 text-left hover:bg-indigo-50 focus-visible:bg-indigo-50 dark:hover:bg-indigo-950 dark:focus-visible:bg-indigo-950"
                  >
                    <span className="min-w-0 break-words text-sm font-semibold text-slate-900 dark:text-slate-100">{name}</span>
                    <span className="text-xs text-slate-500 dark:text-slate-400">{category}</span>
                    {alias && <span className="w-full break-words text-xs text-slate-500 dark:text-slate-400">Alias {alias}</span>}
                    {!visibleIds.has(id) && <span className="w-full text-xs font-medium text-indigo-700 dark:text-indigo-300">Tampilkan di graf</span>}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {results.length > resultLimit && (
            <button
              type="button"
              onClick={() => setResultLimit(limit => limit + RESULTS_PER_PAGE)}
              className="w-full rounded-lg px-3 py-2 text-left text-xs font-medium text-indigo-700 hover:bg-indigo-50 dark:text-indigo-300 dark:hover:bg-indigo-950"
            >
              Tampilkan lebih banyak ({results.length - resultLimit} lagi)
            </button>
          )}
        </div>
      )}
    </div>
  );
}
