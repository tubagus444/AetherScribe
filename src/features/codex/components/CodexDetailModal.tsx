import React, { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'motion/react';
import { Tag, Link2, X, Edit2, Trash2, FlaskConical, Crosshair, EyeOff, Dices, Quote, CornerDownRight, ListChecks, MapPin, Map as MapIcon, CalendarDays } from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/src/db';
import { CodexEntry, Relationship, PlotPromise } from '@/src/types';
import { buildLoreGraph } from '@/src/lib/loreGraph';
import { effectiveStatus, parseTodos } from '@/src/lib/worldCompleteness';
import { WorldStatusBadge } from '@/src/features/codex/components/WorldStatusBadge';
import { useNavigation } from '@/src/contexts/NavigationContext';
import { PlotClueIdeas } from '@/src/features/consistency/components/PlotClueIdeas';
import { QuickPromiseModal, type QuickPromiseSeed } from '@/src/features/consistency/components/QuickPromiseModal';
import { NameForgeModal } from '@/src/features/codex/components/NameForgeModal';
import { CategoryIcon } from '@/src/features/codex/components/CategoryIcon';
import { LinkifiedDescription } from '@/src/features/codex/components/LinkifiedDescription';
import { AppearancesList } from '@/src/features/codex/components/AppearancesList';
import { getRelationshipLabel, RELATIONSHIP_TYPES } from '@/src/features/codex/relationshipTypes';
import { getCategoryLabel, getCategoryAccent, type CategoryDef } from '@/src/lib/codexCategories';
import { resolveFieldValues } from '@/src/lib/codexFields';
import { formatDate } from '@/src/lib/worldCalendar';
import { readCurrentDetail, readDetailHistory, type DetailChapterIndex } from '@/src/lib/codexDetails';
import { useCodexCover, useCoverUrl } from '@/src/features/codex/hooks/useCodexCover';
import { CodexCoverViewer } from '@/src/features/codex/components/CodexCoverViewer';

const fieldScroll = 'no-scrollbar max-h-[min(12rem,30dvh)] overflow-y-auto focus-visible:outline-2 focus-visible:outline-indigo-500';
const detailTabs = [
  { id: 'details', label: 'Deskripsi & Detail' },
  { id: 'links', label: 'Keterkaitan' },
] as const;

interface CodexDetailModalProps {
  entry: CodexEntry;
  entries: CodexEntry[];
  relationships: Relationship[];
  promises?: PlotPromise[];
  projectId: number;
  categories?: CategoryDef[];
  detailChapters: DetailChapterIndex;
  onClose: () => void;
  onEdit: (entry: CodexEntry) => void;
  onDelete: (id: number) => void;
  onAddBond: (sourceId: number, targetId: number, type: string) => void;
  onDeleteRelationship: (id: number) => void;
  onOpenEntry?: (entry: CodexEntry) => void;
}

export function CodexDetailModal({
  entry,
  entries,
  relationships,
  promises,
  projectId,
  categories,
  detailChapters,
  onClose,
  onEdit,
  onDelete,
  onAddBond,
  onDeleteRelationship,
  onOpenEntry
}: CodexDetailModalProps) {
  const titleId = useId();
  const tabsId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  const detailsTabRef = useRef<HTMLButtonElement>(null);
  const thumbnail = useCoverUrl(useCodexCover(entry.id, 'thumbnail'));
  const [showCover, setShowCover] = useState(false);
  const [linksEntryId, setLinksEntryId] = useState<number | null | undefined>(null);
  const isLinksTab = linksEntryId !== null && linksEntryId === entry.id;
  const activeTab = isLinksTab ? 'links' : 'details';
  const selectTab = (tab: (typeof detailTabs)[number]['id']) => setLinksEntryId(tab === 'links' ? entry.id : null);
  const project = useLiveQuery(() => db.projects.get(projectId), [projectId]);
  const entryRelationships = relationships.filter(
    r => r.sourceId === entry.id || r.targetId === entry.id
  );
  const accent = getCategoryAccent(entry.category, categories);
  const linkTargets = entries.filter(e => e.id !== entry.id);
  const fieldValues = resolveFieldValues(entry);
  const status = effectiveStatus(entry);
  const todos = parseTodos(entry.todo);

  // Backlink (#9): siapa yang menunjuk ke entri ini. Relasi sengaja DIKELUARKAN —
  // sudah tampil dua-arah di seksi "Hubungan"; sisakan sebutan-nama & payoff janji
  // yang selama ini tak terlihat dari sisi entri yang ditunjuk.
  const mentionBacklinks = useMemo(() => {
    if (entry.id == null) return [];
    const { backlinks } = buildLoreGraph(entries, relationships, promises || []);
    return (backlinks.get(entry.id) || []).filter(l => l.via !== 'relationship');
  }, [entry.id, entries, relationships, promises]);

  const { openWorkshop, openAtlasMarker } = useNavigation();
  const [bondType, setBondType] = useState('Friend');
  const [bondTarget, setBondTarget] = useState<number | ''>('');
  const [showPromise, setShowPromise] = useState<QuickPromiseSeed | null>(null);
  const [showForge, setShowForge] = useState(false);
  const [showMapMenu, setShowMapMenu] = useState(false);

  const linkedMarkers = useLiveQuery(
    () => entry.id != null ? db.mapMarkers.where('codexId').equals(entry.id).toArray() : Promise.resolve([]),
    [entry.id]
  );
  const maps = useLiveQuery(
    () => db.maps.where('projectId').equals(projectId).toArray(),
    [projectId]
  );

  const mapNameById = useMemo(() => {
    const map = new Map<number, string>();
    if (maps) {
      for (const m of maps) {
        if (m.id != null) map.set(m.id, m.name);
      }
    }
    return map;
  }, [maps]);

  const handleAddBond = () => {
    if (!bondTarget) return;
    onAddBond(entry.id!, Number(bondTarget), bondType);
    setBondTarget('');
  };

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || showPromise || showCover) return;
      if (showForge) setShowForge(false);
      else onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose, showPromise, showForge, showCover]);

  useLayoutEffect(() => {
    const trigger = document.activeElement;
    closeRef.current?.focus();
    return () => {
      if (trigger instanceof HTMLElement && trigger.isConnected) trigger.focus({ preventScroll: true });
    };
  }, []);

  return createPortal(
    <div 
      className="fixed inset-0 z-[var(--z-modal)] flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-3 sm:p-5"
      onClick={event => { if (event.target === event.currentTarget) onClose(); }}
    >
      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        transition={{ type: "spring", bounce: 0, duration: 0.3 }}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="flex max-h-full w-full max-w-[96rem] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900"
        onKeyDown={event => {
          if (event.key !== 'Tab') return;
          const focusable = [...event.currentTarget.querySelectorAll<HTMLElement>('button, a[href], select, summary, [tabindex]')]
            .filter(element => element.tabIndex >= 0 && !element.matches(':disabled') && !element.closest('[inert]') && element.getClientRects().length > 0);
          const active = document.activeElement;
          if (event.shiftKey && active === focusable[0]) {
            event.preventDefault();
            focusable.at(-1)?.focus();
          } else if (!event.shiftKey && active === focusable.at(-1)) {
            event.preventDefault();
            focusable[0]?.focus();
          }
        }}
      >
        <header className="relative z-10 grid shrink-0 grid-cols-[minmax(0,1fr)_auto] items-start gap-x-2 gap-y-1 border-b border-slate-100 bg-slate-50/50 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center sm:px-6 dark:border-slate-800/60 dark:bg-slate-900/50">
          <div className="col-start-1 row-start-1 flex min-w-0 items-center gap-3">
            {thumbnail ? (
              <button type="button" title="Lihat sampul" aria-label="Lihat sampul" onClick={() => setShowCover(true)} className="size-12 shrink-0 overflow-hidden rounded-xl ring-indigo-500 hover:ring-2">
                <img src={thumbnail} alt="" className="size-full object-cover" />
              </button>
            ) : (
              <div className={`shrink-0 rounded-xl border border-slate-100 p-2.5 shadow-sm dark:border-slate-700 ${accent.iconBg}`}>
                <CategoryIcon category={entry.category} categories={categories} />
              </div>
            )}
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 id={titleId} title={entry.name} className="line-clamp-2 min-w-0 break-words text-lg font-bold text-slate-900 sm:text-xl dark:text-slate-100">{entry.name}</h2>
                {entry.hidden && (
                  <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-widest font-bold text-purple-700 dark:text-purple-300 bg-purple-100 dark:bg-purple-900/40 px-2 py-0.5 rounded-full border border-purple-200 dark:border-purple-800/60">
                    <EyeOff size={11} /> Rahasia
                  </span>
                )}
                <WorldStatusBadge status={status.status} suggested={status.suggested} />
              </div>
              <span className="block truncate text-xs font-bold uppercase tracking-widest text-indigo-500 dark:text-indigo-400">
                {getCategoryLabel(entry.category, categories)}
              </span>
            </div>
          </div>
          
          <div className="col-span-2 col-start-1 row-start-2 flex min-w-0 flex-wrap items-center gap-1 sm:col-span-1 sm:col-start-2 sm:row-start-1">
            {linkedMarkers && linkedMarkers.length > 0 && (
              <div className="relative">
                <button
                  onClick={() => {
                    if (linkedMarkers.length === 1) {
                      onClose();
                      openAtlasMarker(linkedMarkers[0].mapId, linkedMarkers[0].id);
                    } else {
                      setShowMapMenu((prev) => !prev);
                    }
                  }}
                  className="p-2 text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/40 rounded-xl transition-all"
                  title={linkedMarkers.length === 1 ? `Lihat di Peta (${mapNameById.get(linkedMarkers[0].mapId) || 'Peta'})` : 'Pilih Peta untuk Melihat Lokasi'}
                >
                  <MapPin size={20} />
                </button>
                {showMapMenu && linkedMarkers.length > 1 && (
                  <div className="absolute right-0 mt-2 w-48 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl py-1 z-50 text-xs">
                    <div className="px-3 py-1.5 font-bold uppercase tracking-wider text-[10px] text-slate-400 border-b border-slate-100 dark:border-slate-700/60">
                      Lihat di Peta:
                    </div>
                    {linkedMarkers.map((mk) => (
                      <button
                        key={mk.id}
                        onClick={() => {
                          setShowMapMenu(false);
                          onClose();
                          openAtlasMarker(mk.mapId, mk.id);
                        }}
                        className="w-full text-left px-3 py-2 text-slate-700 dark:text-slate-200 hover:bg-emerald-50 dark:hover:bg-emerald-900/30 hover:text-emerald-600 dark:hover:text-emerald-400 flex items-center gap-2 transition-colors"
                      >
                        <MapIcon size={14} className="text-emerald-500 shrink-0" />
                        <span className="truncate">{mapNameById.get(mk.mapId) || 'Peta'}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
            <button
              onClick={() => setShowPromise({ projectId, title: entry.name, codexId: entry.id, codexName: entry.name })}
              className="p-2 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-900/40 rounded-xl transition-all"
              title="Tandai sebagai Janji Plot (Chekhov's Gun)"
            >
              <Crosshair size={20} />
            </button>
            <button
              onClick={() => setShowForge(true)}
              className="p-2 text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/50 rounded-xl transition-all"
              title="Bengkel Nama — generator & glos nama (palet fonotaktik)"
            >
              <Dices size={20} />
            </button>
            <button
              onClick={() => { onClose(); openWorkshop({ mode: 'edit', entryId: entry.id!, seedName: entry.name }); }}
              className="p-2 text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/50 rounded-xl transition-all"
              title="Diskusikan & sempurnakan dengan AI (Lokakarya)"
            >
              <FlaskConical size={20} />
            </button>
            <button
              onClick={() => { onClose(); onEdit(entry); }}
              className="p-2 text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/50 rounded-xl transition-all"
              title="Ubah Entri"
            >
              <Edit2 size={20} />
            </button>
            <button 
              onClick={() => { onClose(); onDelete(entry.id!); }}
              className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/50 rounded-xl transition-all"
              title="Hapus Entri"
            >
              <Trash2 size={20} />
            </button>
          </div>
          <button
            ref={closeRef}
            onClick={onClose}
            className="col-start-2 row-start-1 rounded-xl p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 sm:col-start-3 dark:hover:bg-slate-800 dark:hover:text-slate-200"
            aria-label="Tutup"
            title="Tutup"
          >
            <X size={24} />
          </button>
        </header>

        <div
          role="tablist"
          aria-label="Bagian entri Codex"
          className="flex shrink-0 gap-1 border-b border-slate-100 px-4 sm:px-6 dark:border-slate-800"
          onKeyDown={event => {
            const alternate = isLinksTab ? 0 : 1;
            const next: Record<string, number | undefined> = { ArrowLeft: alternate, ArrowRight: alternate, Home: 0, End: 1 };
            const index = next[event.key];
            if (index === undefined) return;
            event.preventDefault();
            selectTab(detailTabs[index].id);
            event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]')[index]?.focus();
          }}
        >
          {detailTabs.map(tab => (
            <button
              key={tab.id}
              type="button"
              ref={tab.id === 'details' ? detailsTabRef : undefined}
              role="tab"
              id={`${tabsId}-${tab.id}-tab`}
              aria-controls={`${tabsId}-${tab.id}-panel`}
              aria-selected={activeTab === tab.id}
              tabIndex={activeTab === tab.id ? 0 : -1}
              onClick={() => selectTab(tab.id)}
              className="border-b-2 border-transparent px-3 py-2.5 text-sm font-medium text-slate-500 hover:text-indigo-600 aria-selected:border-indigo-500 aria-selected:text-indigo-700 dark:text-slate-400 dark:hover:text-indigo-300 dark:aria-selected:text-indigo-300"
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-1">
          <div role="tabpanel" id={`${tabsId}-details-panel`} aria-labelledby={`${tabsId}-details-tab`} aria-hidden={isLinksTab} inert={isLinksTab} className="col-start-1 row-start-1 flex min-h-0 min-w-0 flex-col aria-hidden:invisible">
            <div key={entry.id} role="region" aria-label="Isi entri Codex" tabIndex={0} className="no-scrollbar grid min-h-0 flex-1 auto-rows-max overflow-y-auto overscroll-contain [overflow-wrap:anywhere] lg:auto-rows-auto lg:grid-cols-[minmax(0,5fr)_minmax(0,4fr)] lg:overflow-hidden">
              <section aria-label="Deskripsi dan identitas" className="flex min-w-0 flex-col gap-5 p-4 sm:p-6 lg:min-h-0 lg:overflow-hidden">
                <div className="lg:flex lg:min-h-0 lg:flex-1 lg:flex-col">
                  <h3 className="mb-2 shrink-0 text-sm font-bold text-slate-800 dark:text-slate-100">Deskripsi</h3>
                  <div role="region" aria-label="Teks deskripsi" tabIndex={0} className="no-scrollbar prose prose-slate max-h-[min(22rem,45dvh)] max-w-none overflow-y-auto font-serif text-slate-700 focus-visible:outline-2 focus-visible:outline-indigo-500 lg:min-h-0 lg:max-h-none lg:flex-1 dark:prose-invert dark:text-slate-300">
                    {entry.description ? (
                      <LinkifiedDescription text={entry.description} allEntries={entries || []} />
                    ) : (
                      <span className="italic opacity-60">Deskripsi belum diisi.</span>
                    )}
                  </div>
                </div>

                {((entry.aliases?.length ?? 0) > 0 || (entry.tags?.length ?? 0) > 0 || (entry.birthDate && project?.calendar)) && (
                  <div role="region" aria-label="Identitas entri" tabIndex={0} className="no-scrollbar space-y-3 lg:order-first lg:max-h-[min(10rem,25dvh)] lg:shrink-0 lg:overflow-y-auto">
                    {/* Aliases */}
                    {(entry.aliases?.length ?? 0) > 0 && (
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="inline-flex items-center gap-1.5 text-xs uppercase tracking-widest font-bold text-slate-400 dark:text-slate-500 mr-2">
                          <Tag size={14} /> Alias:
                        </span>
                        {entry.aliases!.map(a => (
                          <span key={a} className="text-xs font-semibold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 px-3 py-1 rounded-lg border border-slate-200 dark:border-slate-700">
                            {a}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Tags */}
                    {(entry.tags?.length ?? 0) > 0 && (
                      <div className="flex flex-wrap items-center gap-2">
                        {entry.tags!.map(t => (
                          <span key={t} className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/30 px-3 py-1 rounded-lg border border-indigo-100 dark:border-indigo-800/50">
                            #{t}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Tanggal Lahir (Karakter) */}
                    {entry.birthDate && project?.calendar && (
                      <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-indigo-50/80 dark:bg-indigo-950/40 border border-indigo-100 dark:border-indigo-900/40 text-xs">
                        <CalendarDays size={13} className="text-indigo-500" />
                        <span className="font-semibold text-slate-500 dark:text-slate-400">Tanggal Lahir:</span>
                        <span className="font-mono font-bold text-indigo-700 dark:text-indigo-300">
                          {formatDate(project.calendar, entry.birthDate)}
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </section>

              <section aria-label="Detail entri" tabIndex={0} className="no-scrollbar min-w-0 space-y-5 border-t border-slate-100 p-4 sm:p-6 lg:min-h-0 lg:overflow-y-auto lg:overscroll-contain lg:border-l lg:border-t-0 dark:border-slate-800">
                {!!entry.details?.length && (
                  <section className="space-y-3" aria-label="Detail tambahan">
                    <h4 className="text-sm font-bold text-slate-800 dark:text-slate-100">Detail tambahan</h4>
                    {entry.details.map(detail => {
                      const history = readDetailHistory(detail, detailChapters);
                      const current = readCurrentDetail(detail, history);
                      return (
                        <div key={detail.id} className="space-y-2 rounded-xl border border-slate-200 p-4 dark:border-slate-800">
                          <div className="flex flex-wrap items-baseline justify-between gap-2">
                            <h5 className="min-w-0 break-words text-sm font-semibold text-slate-800 dark:text-slate-200">{detail.label}</h5>
                            <span className="text-xs text-slate-500 dark:text-slate-400">{detail.includeInAI ? 'Disertakan ke AI' : 'Hanya di Codex'}</span>
                          </div>
                          {current.chapter && <p className="text-xs font-medium text-indigo-600 dark:text-indigo-400">Bab {current.chapter.position + 1} · {current.chapter.title}</p>}
                          <div role="region" aria-label={`Nilai ${detail.label}`} tabIndex={0} className={`${fieldScroll} whitespace-pre-wrap text-sm text-slate-700 dark:text-slate-200`}>{current.value || 'Belum diisi.'}</div>
                          {detail.revisions && (
                            <details className="border-t border-slate-200 pt-2 text-sm dark:border-slate-800">
                              <summary className="cursor-pointer font-medium text-indigo-600 dark:text-indigo-400">Riwayat per bab</summary>
                              <ol tabIndex={0} aria-label={`Riwayat ${detail.label}`} className={`${fieldScroll} mt-2 space-y-2`}>
                                {detail.value && <li><div className="text-xs font-medium">Nilai awal</div><p className="whitespace-pre-wrap break-words">{detail.value}</p></li>}
                                {history.map(revision => (
                                  <li key={revision.id}>
                                    <div className="break-words text-xs font-medium">{revision.chapter ? `Bab ${revision.chapter.position + 1} · ${revision.chapter.title}` : `${revision.detachedChapterTitle || 'Bab'} (terhapus)`}</div>
                                    <p className="whitespace-pre-wrap break-words">{revision.value}</p>
                                  </li>
                                ))}
                              </ol>
                              {!history.length && <p className="mt-2 text-xs text-slate-500">Belum ada catatan yang ditautkan ke bab.</p>}
                            </details>
                          )}
                        </div>
                      );
                    })}
                  </section>
                )}

                {/* Template field per kategori (#17) — detail terstruktur khas kategori */}
                {fieldValues.length > 0 && (
                  <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/40 p-5">
                    <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4">
                      {fieldValues.map(f => (
                        <div key={f.key} className="min-w-0">
                          <dt className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-1">{f.label}</dt>
                          <dd aria-label={f.label} tabIndex={0} className={`${fieldScroll} whitespace-pre-wrap text-sm text-slate-700 dark:text-slate-200`}>{f.value}</dd>
                        </div>
                      ))}
                    </dl>
                  </div>
                )}

                {/* Kebenaran tersembunyi — hanya untuk penulis, tak pernah ke output pembaca */}
                {entry.secret?.trim() && (
                  <div className="rounded-2xl border border-purple-200 dark:border-purple-800/50 bg-purple-50/50 dark:bg-purple-900/15 p-5">
                    <h4 className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-purple-700 dark:text-purple-300 mb-2">
                      <EyeOff size={14} /> Kebenaran Tersembunyi
                      <span className="font-normal normal-case tracking-normal text-purple-400 dark:text-purple-500">· hanya penulis &amp; AI</span>
                    </h4>
                    <p aria-label="Isi Kebenaran Tersembunyi" tabIndex={0} className={`${fieldScroll} whitespace-pre-wrap font-serif leading-relaxed text-slate-700 dark:text-slate-300`}>{entry.secret.trim()}</p>
                  </div>
                )}

                {entry.id != null && (entry.secret?.trim() || (entry.hidden && entry.description?.trim())) && (
                  <PlotClueIdeas key={entry.id} secret={entry.name + "\n" + (entry.secret?.trim() || entry.description)} entryId={entry.id} projectId={projectId} promises={promises ?? []} chapters={detailChapters} onChoose={setShowPromise} />
                )}

                {/* Catatan & TODO (#11) — pekerjaan worldbuilding yang tersisa untuk entri ini */}
                {todos.length > 0 && (
                  <div className="rounded-2xl border border-amber-200 dark:border-amber-800/50 bg-amber-50/50 dark:bg-amber-900/15 p-5">
                    <h4 className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-amber-700 dark:text-amber-300 mb-3">
                      <ListChecks size={14} /> Catatan &amp; TODO
                    </h4>
                    <ul aria-label="Daftar catatan" tabIndex={0} className={`${fieldScroll} space-y-1.5`}>
                      {todos.map((t, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm text-slate-700 dark:text-slate-300">
                          <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-amber-400 shrink-0" />
                          <span className="whitespace-pre-wrap break-words">{t}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

              </section>
            </div>
          </div>

          <div role="tabpanel" id={`${tabsId}-links-panel`} aria-labelledby={`${tabsId}-links-tab`} aria-hidden={!isLinksTab} inert={!isLinksTab} tabIndex={0} className="no-scrollbar col-start-1 row-start-1 min-h-0 min-w-0 overflow-y-auto overscroll-contain p-4 [overflow-wrap:anywhere] aria-hidden:invisible sm:p-6">
            <div key={entry.id} className="grid grid-cols-1 items-start gap-6 md:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
              {/* Relationships — dikelola di sini (tambah/hapus) */}
              <div>
                <h4 className="text-sm font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-4 flex items-center gap-2">
                  <Link2 size={16} /> Hubungan
                </h4>
                <div className="flex flex-col gap-2">
                  {entryRelationships.map(r => {
                    const isSource = r.sourceId === entry.id;
                    const otherId = isSource ? r.targetId : r.sourceId;
                    const otherEntry = entries?.find(e => e.id === otherId);
                    if (!otherEntry) return null;
                    return (
                      <div key={r.id} className="group/bond flex items-center justify-between gap-2 bg-indigo-50/50 dark:bg-indigo-900/20 px-4 py-3 rounded-xl border border-indigo-100 dark:border-indigo-800/50">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="font-semibold text-indigo-700 dark:text-indigo-400 text-sm shrink-0">{getRelationshipLabel(r.type, isSource)}</span>
                          <span className="text-indigo-400 dark:text-indigo-600 text-sm shrink-0">dengan</span>
                          <span className="font-bold text-slate-900 dark:text-slate-100 truncate">{otherEntry.name}</span>
                        </div>
                        <button
                          onClick={() => onDeleteRelationship(r.id!)}
                          className="shrink-0 p-1 text-indigo-300 dark:text-indigo-500 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/40 rounded-lg opacity-0 group-hover/bond:opacity-100 focus:opacity-100 transition-all"
                          title="Hapus hubungan"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    );
                  })}
                  {entryRelationships.length === 0 && (
                    <p className="text-sm text-slate-400 dark:text-slate-500 italic">Belum ada hubungan.</p>
                  )}
                </div>

                {/* Tambah hubungan */}
                {linkTargets.length > 0 && (
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <select
                      value={bondType}
                      onChange={e => setBondType(e.target.value)}
                      title="Tipe hubungan"
                      className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-2 text-xs focus:ring-2 focus:ring-indigo-500 outline-none dark:text-slate-200"
                    >
                      {RELATIONSHIP_TYPES.map(t => (
                        <option key={t.value} value={t.value}>{t.label}</option>
                      ))}
                    </select>
                    <select
                      value={bondTarget}
                      onChange={e => setBondTarget(e.target.value ? Number(e.target.value) : '')}
                      title="Entri tujuan"
                      className="flex-1 min-w-[120px] bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-2 text-xs focus:ring-2 focus:ring-indigo-500 outline-none dark:text-slate-200"
                    >
                      <option value="">Pilih entri…</option>
                      {linkTargets.map(e => (
                        <option key={e.id} value={e.id}>{e.name}</option>
                      ))}
                    </select>
                    <button
                      onClick={handleAddBond}
                      disabled={!bondTarget}
                      className="text-[10px] font-bold uppercase tracking-widest bg-indigo-600 text-white px-3 py-2 rounded-lg disabled:opacity-50 hover:bg-indigo-700 transition shadow-sm active:scale-95"
                    >
                      Tambah
                    </button>
                  </div>
                )}
              </div>

              <div className="space-y-6">
                {/* Appearances */}
                <div>
                  <h4 className="text-sm font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-4">
                    Kemunculan
                  </h4>
                  <AppearancesList entry={entry} projectId={projectId} />
                </div>
                {/* Backlink (#9) — "apa yang menyebut entri ini" (sebutan nama + payoff janji) */}
                <div>
                  <h4 className="text-sm font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-4 flex items-center gap-2">
                    <Quote size={16} /> Disebut oleh
                  </h4>
                  {mentionBacklinks.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {mentionBacklinks.map(link => {
                        if (link.via === 'payoff') {
                          return (
                            <span
                              key={`payoff-${link.sourceId}`}
                              className="inline-flex items-center gap-1.5 text-sm bg-rose-50 dark:bg-rose-900/20 text-rose-700 dark:text-rose-300 px-3 py-2 rounded-xl border border-rose-100 dark:border-rose-800/50"
                              title="Janji plot yang dibayar/diungkap oleh entri ini"
                            >
                              <Crosshair size={13} className="shrink-0" />
                              <span className="font-semibold truncate max-w-[220px]">{link.sourceName}</span>
                              <span className="text-rose-400 dark:text-rose-500 text-xs">· janji</span>
                            </span>
                          );
                        }
                        const source = entries.find(e => e.id === link.sourceId);
                        return (
                          <button
                            key={`mention-${link.sourceId}`}
                            onClick={() => {
                              if (!source || !onOpenEntry) return;
                              selectTab('details');
                              onOpenEntry(source);
                              detailsTabRef.current?.focus();
                            }}
                            disabled={!source || !onOpenEntry}
                            className="group/back inline-flex items-center gap-1.5 text-sm bg-indigo-50/60 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-300 px-3 py-2 rounded-xl border border-indigo-100 dark:border-indigo-800/50 hover:bg-indigo-100 dark:hover:bg-indigo-900/40 disabled:hover:bg-indigo-50/60 dark:disabled:hover:bg-indigo-900/20 transition-all disabled:cursor-default"
                            title={source ? `Buka ${link.sourceName}` : link.sourceName}
                          >
                            <CornerDownRight size={13} className="shrink-0 opacity-60" />
                            <span className="font-semibold truncate max-w-[220px]">{link.sourceName}</span>
                          </button>
                        );
                      })}
                    </div>
                  ) : <p className="text-sm italic text-slate-400 dark:text-slate-500">Belum ada rujukan ke entri ini.</p>}
                </div>
              </div>
            </div>
          </div>
        </div>
      </motion.div>

      {showPromise && (
        <QuickPromiseModal
          seed={showPromise}
          onClose={() => setShowPromise(null)}
        />
      )}

      {showForge && (
        <NameForgeModal entry={entry} onClose={() => setShowForge(false)} />
      )}
      {showCover && <CodexCoverViewer codexId={entry.id} name={entry.name} onClose={() => setShowCover(false)} />}
    </div>,
    document.body,
  );
}
